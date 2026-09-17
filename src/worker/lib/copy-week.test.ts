import { describe, expect, it } from "vitest";
import { createD1Stub } from "../../test/d1-stub";
import type { TimeEntryJoinRow } from "../db/rows";
import { planCopyWeek } from "./copy-week";

function row(overrides: Partial<TimeEntryJoinRow>): TimeEntryJoinRow {
  return {
    id: "entry-1",
    workspace_id: "workspace-A",
    user_id: "user-1",
    project_id: "project-1",
    task_id: null,
    description: "Client call",
    start: "2026-09-07T14:00:00.000Z",
    stop: "2026-09-07T15:00:00.000Z",
    duration: 3600,
    billable: 1,
    sync_status: null,
    external_id: null,
    synced_at: null,
    sync_error: null,
    calendar_event_id: null,
    created_at: "2026-09-07T15:00:00.000Z",
    updated_at: "2026-09-07T15:00:00.000Z",
    project_name: "Acme",
    project_color: "#ff0000",
    client_name: "Acme Corp",
    task_name: null,
    user_name: "Richard",
    user_email: "richard@example.com",
    user_image: null,
    tag_names: null,
    ...overrides,
  };
}

const SOURCE_WEEK_START = "2026-09-07T00:00:00.000Z";
const TARGET_WEEK_START = "2026-09-14T00:00:00.000Z";

describe("planCopyWeek", () => {
  it("returns an empty plan without querying projects when the source week has nothing to copy", async () => {
    const { db, calls } = createD1Stub({ all: () => ({ results: [] }) });
    const outcome = await planCopyWeek(db, "workspace-A", "user-1", SOURCE_WEEK_START, TARGET_WEEK_START);
    expect(outcome).toEqual({ ok: true, plan: { statements: [], createdIds: [], tagsByCreatedId: new Map() } });
    expect(calls).toHaveLength(1);
  });

  it("builds one INSERT per entry, shifted by the source→target offset, and carries tags", async () => {
    const source = [
      row({ id: "entry-1", tag_names: "billable,urgent" }),
      row({
        id: "entry-2",
        start: "2026-09-09T09:00:00.000Z",
        stop: "2026-09-09T09:30:00.000Z",
        duration: 1800,
      }),
    ];
    const { db, calls } = createD1Stub({
      all: (call) =>
        call.sql.includes("FROM time_entries te")
          ? { results: source }
          : { results: [{ id: "project-1" }] }, // active-project check
    });

    const outcome = await planCopyWeek(db, "workspace-A", "user-1", SOURCE_WEEK_START, TARGET_WEEK_START);
    if (!outcome.ok) throw new Error("expected ok plan");

    expect(outcome.plan.statements).toHaveLength(2);
    expect(outcome.plan.createdIds).toHaveLength(2);
    expect(outcome.plan.tagsByCreatedId.get(outcome.plan.createdIds[0])).toEqual(["billable", "urgent"]);
    expect(outcome.plan.tagsByCreatedId.has(outcome.plan.createdIds[1])).toBe(false);

    // The stub only records a statement's params once it runs.
    for (const stmt of outcome.plan.statements) await stmt.run();
    const insertCalls = calls.filter((c) => c.sql.includes("INSERT INTO time_entries"));
    expect(insertCalls).toHaveLength(2);
    // A week (7 days) forward, exactly the client's "copy last week" shift.
    expect(insertCalls[0].params[6]).toBe("2026-09-14T14:00:00.000Z"); // start
    expect(insertCalls[0].params[7]).toBe("2026-09-14T15:00:00.000Z"); // stop
    expect(insertCalls[1].params[6]).toBe("2026-09-16T09:00:00.000Z");
    expect(insertCalls[1].params[7]).toBe("2026-09-16T09:30:00.000Z");
  });

  it("refuses the whole copy when one entry's project is no longer active", async () => {
    const source = [
      row({ id: "entry-1", project_id: "project-1" }),
      row({ id: "entry-2", project_id: "project-2" }),
    ];
    const { db } = createD1Stub({
      all: (call) =>
        call.sql.includes("FROM time_entries te")
          ? { results: source }
          : { results: [{ id: "project-1" }] }, // project-2 archived since the entry was logged
    });

    const outcome = await planCopyWeek(db, "workspace-A", "user-1", SOURCE_WEEK_START, TARGET_WEEK_START);
    expect(outcome).toEqual({
      ok: false,
      error: "Choose an active project for every entry before copying",
      entryIds: ["entry-2"],
    });
  });
});
