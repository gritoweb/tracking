import { describe, expect, it } from "vitest";
import {
  canEditEntry,
  canManageWorkspace,
  canWriteEntry,
  currentMemberIds,
  entryScopeUserId,
  getMemberRole,
  isManager,
} from "./permissions";
import { createD1Stub } from "../../test/d1-stub";

describe("canManageWorkspace", () => {
  it("is true for owner and admin, false for member and null", () => {
    expect(canManageWorkspace("owner")).toBe(true);
    expect(canManageWorkspace("admin")).toBe(true);
    expect(canManageWorkspace("member")).toBe(false);
    expect(canManageWorkspace(null)).toBe(false);
  });
});

describe("canEditEntry", () => {
  it("lets a manager edit anyone's entry", () => {
    expect(canEditEntry("owner", "someone-else", "me")).toBe(true);
    expect(canEditEntry("admin", "someone-else", "me")).toBe(true);
  });

  it("lets anyone edit an entry with no recorded owner", () => {
    expect(canEditEntry("member", null, "me")).toBe(true);
  });

  it("lets a member edit only their own entry", () => {
    expect(canEditEntry("member", "me", "me")).toBe(true);
    expect(canEditEntry("member", "someone-else", "me")).toBe(false);
  });
});

describe("canWriteEntry", () => {
  const runningEntry = (userId: string | null) => ({ user_id: userId, stop: null });
  const stoppedEntry = (userId: string | null) => ({ user_id: userId, stop: "2026-01-01T00:00:00.000Z" });

  it("only the owner may touch their own running timer, managers included", () => {
    expect(canWriteEntry("member", runningEntry("me"), "me")).toBe(true);
    expect(canWriteEntry("owner", runningEntry("someone-else"), "me")).toBe(false);
    expect(canWriteEntry("admin", runningEntry("someone-else"), "me")).toBe(false);
  });

  it("falls back to canEditEntry rules once the entry has stopped", () => {
    expect(canWriteEntry("owner", stoppedEntry("someone-else"), "me")).toBe(true);
    expect(canWriteEntry("member", stoppedEntry("someone-else"), "me")).toBe(false);
    expect(canWriteEntry("member", stoppedEntry(null), "me")).toBe(true);
  });
});

describe("entryScopeUserId", () => {
  it("is unscoped (null) for a manager", () => {
    expect(entryScopeUserId("owner", "me")).toBeNull();
    expect(entryScopeUserId("admin", "me")).toBeNull();
  });

  it("is scoped to the caller for a plain member or no role", () => {
    expect(entryScopeUserId("member", "me")).toBe("me");
    expect(entryScopeUserId(null, "me")).toBe("me");
  });
});

describe("getMemberRole", () => {
  it("returns the stored role for a member of the workspace", async () => {
    const { db } = createD1Stub({ first: () => ({ role: "admin" }) });
    expect(await getMemberRole(db, "workspace-1", "user-1")).toBe("admin");
  });

  it("returns null when the row doesn't exist", async () => {
    const { db } = createD1Stub({ first: () => null });
    expect(await getMemberRole(db, "workspace-1", "stranger")).toBeNull();
  });
});

describe("isManager", () => {
  it("resolves through getMemberRole + canManageWorkspace", async () => {
    const { db } = createD1Stub({ first: () => ({ role: "owner" }) });
    expect(await isManager(db, "workspace-1", "user-1")).toBe(true);
  });

  it("is false for a plain member", async () => {
    const { db } = createD1Stub({ first: () => ({ role: "member" }) });
    expect(await isManager(db, "workspace-1", "user-1")).toBe(false);
  });
});

describe("currentMemberIds", () => {
  it("returns an empty array without querying for an empty input", async () => {
    const { db, calls } = createD1Stub();
    expect(await currentMemberIds(db, "workspace-1", [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("dedupes the input before querying", async () => {
    const { db, calls } = createD1Stub({ all: () => ({ results: [{ userId: "u1" }] }) });
    await currentMemberIds(db, "workspace-1", ["u1", "u1", "u1"]);
    expect(calls[0]?.params).toEqual(["workspace-1", "u1"]);
  });

  it("drops any id that isn't currently a member", async () => {
    // Caller asked about u1 and a stranger; only u1 comes back from the membership table.
    const { db } = createD1Stub({ all: () => ({ results: [{ userId: "u1" }] }) });
    const result = await currentMemberIds(db, "workspace-1", ["u1", "stranger"]);
    expect(result).toEqual(["u1"]);
  });
});
