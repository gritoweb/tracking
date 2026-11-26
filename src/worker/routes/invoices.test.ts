import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";
import type { Invoice } from "@shared/schemas";
import { invoicesRouter } from "./invoices";

function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'Agency A'), ('ws-B', 'B');
    ${["u-owner", "u-member", "u-eve"].map((id) => `INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('${id}', '${id}', '${id}@x.test', '${now}', '${now}');`).join("\n")}
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES
      ('m-owner', 'ws-A', 'u-owner', 'owner', '${now}'), ('m-member', 'ws-A', 'u-member', 'member', '${now}'), ('m-eve', 'ws-B', 'u-eve', 'owner', '${now}');
    INSERT INTO clients (id, workspace_id, name, address) VALUES ('cl-A', 'ws-A', 'Client A', '1 Main St'), ('cl-B', 'ws-B', 'Client B', NULL);
    INSERT INTO report_settings (workspace_id, company_address, company_phone) VALUES ('ws-A', '9 Side Rd', '555-0100');
  `);
  const as = (userId: string, workspaceId = "ws-A") => routeClient(invoicesRouter, db, { workspaceId, userId });
  const settings = () => raw.prepare(`SELECT last_invoice_number, invoice_due_days FROM report_settings WHERE workspace_id = 'ws-A'`).get();
  return { as, raw, settings };
}

const body = {
  clientId: "cl-A",
  number: "7",
  issueDate: "2026-11-01",
  dueDate: "2026-12-01",
  periodFrom: "2026-10-01",
  periodTo: "2026-10-31",
  currency: "USD",
  locale: "en" as const,
  lines: [
    { description: "Technical Services", hours: 10, amount: 1000 },
    { description: "Domain renewal", hours: null, amount: 15.5 },
  ],
};

describe("saved invoices", () => {
  it("stores the lines, a server-computed total and frozen parties, and remembers number and due days", async () => {
    const { as, raw, settings } = world();
    const res = await as("u-owner").post("/", { ...body, total: 1 });
    expect(res.status).toBe(201);
    const inv = (await res.json()) as Invoice;
    expect(inv.total).toBe(1015.5);
    expect(inv.client).toEqual({ name: "Client A", email: null, address: "1 Main St", phone: null });
    expect(inv.company).toMatchObject({ name: "Agency A", address: "9 Side Rd", phone: "555-0100" });
    expect(settings()).toEqual({ last_invoice_number: "7", invoice_due_days: 30 });

    // A later edit of the client doesn't rewrite the invoice already sent…
    raw.exec(`UPDATE clients SET address = 'Elsewhere' WHERE id = 'cl-A'`);
    raw.exec(`UPDATE report_settings SET company_phone = '555-0199' WHERE workspace_id = 'ws-A'`);
    expect(((await (await as("u-owner").get(`/${inv.id}`)).json()) as Invoice).client.address).toBe("1 Main St");
    // …until someone saves an edit of it, which takes both parties as they are now.
    const resaved = (await (await as("u-owner").put(`/${inv.id}`, { notes: "x" })).json()) as Invoice;
    expect(resaved.client.address).toBe("Elsewhere");
    expect(resaved.company.phone).toBe("555-0199");
  });

  it("an edit of the lines changes the stored total and its payment term becomes the default; delete removes it", async () => {
    const { as, settings } = world();
    const { id } = (await (await as("u-owner").post("/", body)).json()) as Invoice;
    const edited = await as("u-owner").put(`/${id}`, { lines: [{ description: "Fixed", hours: null, amount: 500 }] });
    expect(((await edited.json()) as Invoice).total).toBe(500);
    await as("u-owner").put(`/${id}`, { issueDate: "2026-11-01", dueDate: "2026-11-11" });
    expect(settings()).toMatchObject({ invoice_due_days: 10 });
    await as("u-owner").del(`/${id}`);
    expect((await as("u-owner").get(`/${id}`)).status).toBe(404);
  });

  it("is refused to a member, reads included", async () => {
    const { as } = world();
    expect((await as("u-member").get("/")).status).toBe(403);
    expect((await as("u-member").post("/", body)).status).toBe(403);
  });

  it("never crosses into another workspace", async () => {
    const { as } = world();
    const { id } = (await (await as("u-owner").post("/", body)).json()) as Invoice;
    expect(await (await as("u-eve", "ws-B").get("/")).json()).toEqual([]);
    expect((await as("u-eve", "ws-B").get(`/${id}`)).status).toBe(404);
    expect((await as("u-eve", "ws-B").put(`/${id}`, { notes: "x" })).status).toBe(404);
    expect((await as("u-eve", "ws-B").post("/", { ...body, clientId: "cl-A" })).status).toBe(404);
  });
});
