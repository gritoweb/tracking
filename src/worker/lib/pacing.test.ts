import { describe, expect, it } from "vitest";
import { atRiskProjects, computePacing, countWorkingDays, loadProjectPacing, type PacingInput } from "./pacing";
import { createD1Stub } from "../../test/d1-stub";

const BASE_INPUT: PacingInput = {
  projectId: "project-1",
  projectName: "Website Redesign",
  projectColor: "#000000",
  clientName: "Acme Co",
  estimatedSeconds: null,
  trackedSeconds: 0,
  recentSeconds: 0,
  billableAmount: 0,
  startDate: null,
  endDate: null,
  lastTracked: null,
};

describe("countWorkingDays", () => {
  it("counts only Mon-Fri, inclusive of both ends", () => {
    // Mon 2026-01-05 .. Sun 2026-01-11: 5 weekdays.
    expect(countWorkingDays(new Date(Date.UTC(2026, 0, 5)), new Date(Date.UTC(2026, 0, 11)))).toBe(5);
  });

  it("counts a single weekday as one", () => {
    expect(countWorkingDays(new Date(Date.UTC(2026, 0, 7)), new Date(Date.UTC(2026, 0, 7)))).toBe(1);
  });

  it("counts a single weekend day as zero", () => {
    expect(countWorkingDays(new Date(Date.UTC(2026, 0, 10)), new Date(Date.UTC(2026, 0, 10)))).toBe(0);
  });

  it("returns 0 for an inverted range", () => {
    expect(countWorkingDays(new Date(Date.UTC(2026, 0, 10)), new Date(Date.UTC(2026, 0, 1)))).toBe(0);
  });
});

describe("computePacing", () => {
  it("is no_budget when there is no estimate", () => {
    const result = computePacing(BASE_INPUT, Date.UTC(2026, 0, 15));
    expect(result.status).toBe("no_budget");
    expect(result.percentUsed).toBeNull();
    expect(result.projectedSeconds).toBeNull();
  });

  it("is no_budget when the estimate is zero or negative", () => {
    const result = computePacing({ ...BASE_INPUT, estimatedSeconds: 0 }, Date.UTC(2026, 0, 15));
    expect(result.status).toBe("no_budget");
  });

  it("is on_track well under budget with no overrun projected", () => {
    const result = computePacing(
      { ...BASE_INPUT, estimatedSeconds: 100 * 3600, trackedSeconds: 10 * 3600, recentSeconds: 0 },
      Date.UTC(2026, 0, 15)
    );
    expect(result.status).toBe("on_track");
    expect(result.percentUsed).toBeCloseTo(0.1);
  });

  it("is over_budget once tracked time reaches the estimate", () => {
    const result = computePacing(
      { ...BASE_INPUT, estimatedSeconds: 10 * 3600, trackedSeconds: 10 * 3600, recentSeconds: 0 },
      Date.UTC(2026, 0, 15)
    );
    expect(result.status).toBe("over_budget");
    expect(result.percentUsed).toBe(1);
  });

  it("is at_risk purely from crossing the 85% share, even with no burn to project from", () => {
    const result = computePacing(
      { ...BASE_INPUT, estimatedSeconds: 10 * 3600, trackedSeconds: 9 * 3600, recentSeconds: 0 },
      Date.UTC(2026, 0, 15)
    );
    expect(result.status).toBe("at_risk");
    expect(result.projectedSeconds).toBeNull(); // no recent burn, so nothing to project
  });

  it("is at_risk when the burn rate projects an overrun before the deadline, even under 85% used", () => {
    // Thu 2026-01-15: a 14-day trailing window ending here holds 10 working days.
    const now = Date.UTC(2026, 0, 15);
    const result = computePacing(
      {
        ...BASE_INPUT,
        estimatedSeconds: 40 * 3600,
        trackedSeconds: 20 * 3600, // 50% used - under the 85% share threshold
        recentSeconds: 90 * 3600, // 9h/working-day burn over the last 10 working days
        endDate: "2026-01-20", // Tue - 4 working days left, projecting well past the 40h budget
      },
      now
    );
    expect(result.percentUsed).toBeLessThan(0.85);
    expect(result.burnPerWorkingDay).toBeCloseTo(9 * 3600);
    expect(result.status).toBe("at_risk");
    expect(result.projectedOverrunSeconds).toBeGreaterThan(0);
  });

  it("does not project an overrun for a dormant project even close to its deadline", () => {
    const result = computePacing(
      {
        ...BASE_INPUT,
        estimatedSeconds: 100 * 3600,
        trackedSeconds: 20 * 3600,
        recentSeconds: 0, // nothing logged in the trailing window
        endDate: "2026-01-16",
      },
      Date.UTC(2026, 0, 15)
    );
    expect(result.projectedSeconds).toBeNull();
    expect(result.status).toBe("on_track");
  });

  it("has no workingDaysRemaining without an endDate", () => {
    const result = computePacing({ ...BASE_INPUT, estimatedSeconds: 3600 }, Date.UTC(2026, 0, 15));
    expect(result.workingDaysRemaining).toBeNull();
  });
});

describe("atRiskProjects", () => {
  it("keeps only over_budget and at_risk, worst first", () => {
    const onTrack = computePacing({ ...BASE_INPUT, projectId: "p-ok", estimatedSeconds: 3600, trackedSeconds: 0 }, 0);
    const atRisk = computePacing(
      { ...BASE_INPUT, projectId: "p-risk", estimatedSeconds: 100, trackedSeconds: 90 },
      0
    );
    const overBudget = computePacing(
      { ...BASE_INPUT, projectId: "p-over", estimatedSeconds: 100, trackedSeconds: 150 },
      0
    );
    const noBudget = computePacing({ ...BASE_INPUT, projectId: "p-none" }, 0);

    const result = atRiskProjects([onTrack, atRisk, overBudget, noBudget]);

    expect(result.map((p) => p.projectId)).toEqual(["p-over", "p-risk"]);
  });

  it("breaks ties within a status by percentUsed, worst first", () => {
    const riskLow = computePacing(
      { ...BASE_INPUT, projectId: "p-90", estimatedSeconds: 100, trackedSeconds: 90 },
      0
    );
    const riskHigh = computePacing(
      { ...BASE_INPUT, projectId: "p-99", estimatedSeconds: 100, trackedSeconds: 99 },
      0
    );

    const result = atRiskProjects([riskLow, riskHigh]);

    expect(result.map((p) => p.projectId)).toEqual(["p-99", "p-90"]);
  });

  it("returns an empty list when nothing is at risk", () => {
    const onTrack = computePacing({ ...BASE_INPUT, estimatedSeconds: 3600, trackedSeconds: 0 }, 0);
    expect(atRiskProjects([onTrack])).toEqual([]);
  });
});

describe("loadProjectPacing", () => {
  it("converts estimated hours to seconds and computes billable amount from rate", async () => {
    const { db } = createD1Stub({
      all: () => ({
        results: [
          {
            id: "p1",
            name: "Website",
            color: "#111111",
            estimated_hours: 10,
            start_date: null,
            end_date: null,
            rate: 100,
            client_name: "Acme",
            tracked_seconds: 3600 * 5,
            recent_seconds: 3600 * 2,
            billable_seconds: 3600 * 3, // 3 billable hours at $100/h
            last_tracked: "2026-01-10T00:00:00.000Z",
          },
        ],
      }),
    });

    const [pacing] = await loadProjectPacing(db, "workspace-1", Date.UTC(2026, 0, 15));

    expect(pacing.estimatedSeconds).toBe(10 * 3600);
    expect(pacing.billableAmount).toBe(300);
    expect(pacing.clientName).toBe("Acme");
  });

  it("treats a null/zero estimate as no budget rather than dividing by it", async () => {
    const { db } = createD1Stub({
      all: () => ({
        results: [
          {
            id: "p1",
            name: "Internal",
            color: "#222222",
            estimated_hours: null,
            start_date: null,
            end_date: null,
            rate: 0,
            client_name: null,
            tracked_seconds: 0,
            recent_seconds: 0,
            billable_seconds: 0,
            last_tracked: null,
          },
        ],
      }),
    });

    const [pacing] = await loadProjectPacing(db, "workspace-1", Date.UTC(2026, 0, 15));

    expect(pacing.estimatedSeconds).toBeNull();
    expect(pacing.status).toBe("no_budget");
    expect(pacing.billableAmount).toBe(0);
  });

  it("returns an empty list for a workspace with no active projects", async () => {
    const { db } = createD1Stub({ all: () => ({ results: [] }) });
    const result = await loadProjectPacing(db, "workspace-1", Date.UTC(2026, 0, 15));
    expect(result).toEqual([]);
  });
});
