import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";
import { clientsRouter } from "./clients";

function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    ${["u-owner", "u-member", "u-eve"].map((id) => `INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('${id}', '${id}', '${id}@x.test', '${now}', '${now}');`).join("\n")}
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES
      ('m-owner', 'ws-A', 'u-owner', 'owner', '${now}'), ('m-member', 'ws-A', 'u-member', 'member', '${now}'), ('m-eve', 'ws-B', 'u-eve', 'owner', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client A'), ('cl-B', 'ws-B', 'Client B');
    INSERT INTO client_services (id, workspace_id, client_id, name, amount) VALUES ('sv-B', 'ws-B', 'cl-B', 'Hosting', 50);
  `);
  const as = (userId: string, workspaceId: string) => routeClient(clientsRouter, db, { workspaceId, userId });
  const service = (id: string) => raw.prepare(`SELECT * FROM client_services WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  const count = () => (raw.prepare(`SELECT COUNT(*) AS n FROM client_services`).get() as { n: number }).n;
  return { as, raw, service, count };
}

describe("a client's hourly rate", () => {
  it("is set and cleared by an owner", async () => {
    const { as } = world();
    const set = await as("u-owner", "ws-A").put("/cl-A", { rate: 80 });
    expect(((await set.json()) as { rate: number }).rate).toBe(80);
    const cleared = await as("u-owner", "ws-A").put("/cl-A", { rate: null });
    expect(((await cleared.json()) as { rate: number | null }).rate).toBeNull();
  });

  it("is refused to a member", async () => {
    const { as } = world();
    expect((await as("u-member", "ws-A").put("/cl-A", { rate: 80 })).status).toBe(403);
  });
});

describe("a client's invoice currency", () => {
  it("is set and cleared by an owner, and must be a currency code", async () => {
    const { as } = world();
    const set = await as("u-owner", "ws-A").put("/cl-A", { currency: "USD" });
    expect(((await set.json()) as { currency: string }).currency).toBe("USD");
    const cleared = await as("u-owner", "ws-A").put("/cl-A", { currency: null });
    expect(((await cleared.json()) as { currency: string | null }).currency).toBeNull();
    expect((await as("u-owner", "ws-A").put("/cl-A", { currency: "dollar" })).status).toBe(400);
  });

  it("is refused to a member", async () => {
    const { as } = world();
    expect((await as("u-member", "ws-A").put("/cl-A", { currency: "USD" })).status).toBe(403);
  });
});

describe("a client's fixed services", () => {
  it("an owner adds, edits and removes one", async () => {
    const { as, service } = world();
    const res = await as("u-owner", "ws-A").post("/cl-A/services", { name: "Email server", amount: 35 });
    expect(res.status).toBe(201);
    const { id, billable } = (await res.json()) as { id: string; billable: boolean };
    expect(billable).toBe(true);

    const edited = await as("u-owner", "ws-A").put(`/cl-A/services/${id}`, { billable: false, amount: 40 });
    expect(await edited.json()).toMatchObject({ billable: false, amount: 40 });

    await as("u-owner", "ws-A").del(`/cl-A/services/${id}`);
    expect(service(id)).toBeUndefined();
  });

  it("a member reads them but cannot change them", async () => {
    const { as, count } = world();
    expect((await as("u-member", "ws-A").get("/cl-A/services")).status).toBe(200);
    expect((await as("u-member", "ws-A").post("/cl-A/services", { name: "X", amount: 1 })).status).toBe(403);
    expect(count()).toBe(1);
  });

  it("never crosses into another workspace", async () => {
    const { as, service } = world();
    expect((await as("u-owner", "ws-A").post("/cl-B/services", { name: "X", amount: 1 })).status).toBe(404);
    expect(await (await as("u-owner", "ws-A").get("/cl-B/services")).json()).toEqual([]);
    expect((await as("u-owner", "ws-A").put("/cl-B/services/sv-B", { amount: 1 })).status).toBe(404);
    await as("u-owner", "ws-A").del("/cl-B/services/sv-B");
    expect(service("sv-B")).toMatchObject({ amount: 50 });
  });

  it("go with their client when the client row is deleted", async () => {
    const { raw, count } = world();
    raw.exec(`PRAGMA foreign_keys = ON; DELETE FROM clients WHERE id = 'cl-B';`);
    expect(count()).toBe(0);
  });
});

describe("a client's billable amount in /stats", () => {
  it("prices only billable hours at the client's rate, else the workspace default", async () => {
    const { as, raw } = world();
    raw.exec(`
      INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A2', 'ws-A', 'No rate');
      UPDATE clients SET rate = 65 WHERE id = 'cl-A';
      UPDATE workspaces SET default_rate = 40 WHERE id = 'ws-A';
      INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p1', 'ws-A', 'One', 'cl-A'), ('p2', 'ws-A', 'Two', 'cl-A2');
      INSERT INTO time_entries (id, workspace_id, user_id, project_id, description, start, stop, duration, billable) VALUES
        ('e1', 'ws-A', 'u-owner', 'p1', 'x', '2026-09-02T10:00:00.000Z', '2026-09-02T12:00:00.000Z', 7200, 1),
        ('e2', 'ws-A', 'u-owner', 'p1', 'x', '2026-09-03T10:00:00.000Z', '2026-09-03T11:00:00.000Z', 3600, 0),
        ('e3', 'ws-A', 'u-owner', 'p2', 'x', '2026-09-04T10:00:00.000Z', '2026-09-04T11:30:00.000Z', 5400, 1);
    `);
    const res = await as("u-owner", "ws-A").get("/stats?since=2026-09-01T00:00:00.000Z&until=2026-10-01T00:00:00.000Z");
    const rows = (await res.json()) as { clientId: string; billableAmount: number }[];
    expect(rows.find((r) => r.clientId === "cl-A")?.billableAmount).toBe(130);
    expect(rows.find((r) => r.clientId === "cl-A2")?.billableAmount).toBe(60);
  });
});
