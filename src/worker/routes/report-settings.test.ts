import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";
import { REPORT_DEFAULT_COLORS } from "@shared/colors";
import { reportSettingsRouter } from "./report-settings";

function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'Agency A'), ('ws-B', 'B');
    ${["u-owner", "u-member"].map((id) => `INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('${id}', '${id}', '${id}@x.test', '${now}', '${now}');`).join("\n")}
    UPDATE "user" SET currency = 'BRL' WHERE id = 'u-owner';
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES
      ('m-owner', 'ws-A', 'u-owner', 'owner', '${now}'), ('m-member', 'ws-A', 'u-member', 'member', '${now}');
  `);
  const as = (userId: string, workspaceId = "ws-A") => routeClient(reportSettingsRouter, db, { workspaceId, userId });
  return { as, raw };
}

describe("the report settings", () => {
  it("fall back to the workspace's name and its owner's e-mail and currency", async () => {
    const { as } = world();
    expect(await (await as("u-member").get("/")).json()).toEqual({
      companyName: "Agency A",
      companyEmail: "u-owner@x.test",
      colors: REPORT_DEFAULT_COLORS,
      logoUrl: null,
      defaultRate: 100,
      currency: "BRL",
    });
  });

  it("an owner saves branding and the default rate", async () => {
    const { as } = world();
    const res = await as("u-owner").put("/", {
      companyName: "Agency",
      companyEmail: "billing@agency.test",
      colors: { primary: "#112233", accent: "#AABBCC", text: "#000000" },
      defaultRate: 65,
      currency: "USD",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      companyName: "Agency",
      companyEmail: "billing@agency.test",
      colors: { primary: "#112233", accent: "#aabbcc", text: "#000000" },
      defaultRate: 65,
      currency: "USD",
    });
    // A partial save keeps what it didn't name.
    const again = await (await as("u-owner").put("/", { defaultRate: null })).json();
    // Clearing the rate falls back to the default rather than leaving the invoice without one.
    expect(again).toMatchObject({ companyName: "Agency", currency: "USD", defaultRate: 100 });
  });

  it("refuses a colour that isn't a hex value", async () => {
    const { as } = world();
    expect((await as("u-owner").put("/", { colors: { primary: "red", accent: "#000000", text: "#000000" } })).status).toBe(400);
  });

  it("refuses every write to a member and stays per workspace", async () => {
    const { as } = world();
    expect((await as("u-member").put("/", { defaultRate: 10 })).status).toBe(403);
    expect((await as("u-member").del("/logo")).status).toBe(403);
    expect((await as("u-member").request("/logo", { method: "PUT" })).status).toBe(403);
    await as("u-owner").put("/", { companyName: "Agency" });
    expect(((await (await as("u-owner", "ws-B").get("/")).json()) as { companyName: string }).companyName).toBe("B");
  });
});
