import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

/** The MCP transport answers over SSE frames; pull the JSON-RPC body out. */
function parseRpc(text: string): Record<string, unknown> {
  const line = text
    .split("\n")
    .map((l) => l.replace(/^data:\s*/, "").trim())
    .find((l) => l.startsWith("{"));
  if (!line) throw new Error(`No JSON-RPC payload in response: ${text.slice(0, 200)}`);
  return JSON.parse(line);
}

test("mcp: rejects a request with no API key", async ({ page }) => {
  await signUp(page);
  const res = await page.request.post("/mcp", {
    headers: MCP_HEADERS,
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(res.status()).toBe(401);
  expect(res.headers()["www-authenticate"]).toContain("Bearer");
});

test("mcp: a read-only key gets the read tools and none of the write tools", async ({
  page,
}) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;

  const created = await page.request.post("/api/keys", {
    headers: { origin },
    data: { name: "e2e read", scope: "read" },
  });
  expect(created.status()).toBe(201);
  const { plaintext, key } = (await created.json()) as {
    plaintext: string;
    key: { prefix: string };
  };
  // The secret is returned once and never again; the list only ever shows the
  // display prefix.
  expect(plaintext.startsWith("tt_live_")).toBeTruthy();
  const listed = (await (await page.request.get("/api/keys")).json()) as Record<
    string,
    unknown
  >[];
  expect(JSON.stringify(listed)).not.toContain(plaintext);
  expect(listed[0].prefix).toBe(key.prefix);

  const auth = { ...MCP_HEADERS, Authorization: `Bearer ${plaintext}` };

  const init = parseRpc(
    await (
      await page.request.post("/mcp", {
        headers: auth,
        data: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "e2e", version: "1" },
          },
        },
      })
    ).text()
  );
  // Identity a client renders in its connector list. `name` is the wire
  // identifier clients key their config off, so it is asserted separately from
  // the display `title` — swapping one for the other would break existing
  // configs while looking like a cosmetic change.
  const info = (init.result as {
    serverInfo: {
      name: string;
      title?: string;
      websiteUrl?: string;
      icons?: { src: string; mimeType?: string }[];
    };
  }).serverInfo;
  expect(info.name).toBe("timetracker");
  expect(info.title).toBe("TimeTracker");
  // The app's own running origin (APP_URL) — dev serves localhost, not production.
  expect(info.websiteUrl).toBe(origin);
  expect(info.icons?.length).toBeGreaterThan(0);
  // Icons must be absolute and on our own origin — a relative src is
  // unresolvable to a client that only ever saw the /mcp endpoint.
  for (const icon of info.icons ?? []) {
    expect(icon.src.startsWith(`${origin}/`)).toBe(true);
  }
  expect((init.result as { instructions?: string }).instructions).toContain(
    "timezoneOffsetMinutes"
  );

  const tools = parseRpc(
    await (
      await page.request.post("/mcp", {
        headers: auth,
        data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
      })
    ).text()
  );
  const names = (tools.result as { tools: { name: string }[] }).tools.map((t) => t.name);
  expect(names).toContain("get_time_summary");
  expect(names).toContain("get_project_pacing");
  // The full catalog is 25 read + 39 write tools; a read key sees only the reads.
  expect(names).toHaveLength(25);

  // Every read tool must advertise itself as read-only, so a client can badge
  // it and skip the approval prompt it would otherwise raise.
  for (const tool of (tools.result as { tools: { name: string; title?: string; annotations?: Record<string, boolean> }[] }).tools) {
    expect(tool.title, `${tool.name} needs a display title`).toBeTruthy();
    expect(tool.annotations?.readOnlyHint, `${tool.name} should be read-only`).toBe(true);
    expect(tool.annotations?.openWorldHint).toBe(false);
  }
  // A read key isn't shown the write tools at all — not shown-then-refused.
  expect(names).not.toContain("log_time");
  // Timers are app-only (decision 2026-09-18): removed from the catalog entirely, not just gated behind read_write.
  expect(names).not.toContain("start_timer");
  expect(names).not.toContain("stop_timer");
  expect(names).not.toContain("start_favorite");
});

test("mcp: a read_write key gets the full catalog, 25 read tools plus 39 write tools", async ({
  page,
}) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;

  const created = await page.request.post("/api/keys", {
    headers: { origin },
    data: { name: "e2e read_write", scope: "read_write" },
  });
  expect(created.status()).toBe(201);
  const { plaintext } = (await created.json()) as { plaintext: string };
  const auth = { ...MCP_HEADERS, Authorization: `Bearer ${plaintext}` };

  await page.request.post("/mcp", {
    headers: auth,
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "e2e", version: "1" },
      },
    },
  });

  const tools = parseRpc(
    await (
      await page.request.post("/mcp", {
        headers: auth,
        data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
      })
    ).text()
  );
  const list = (tools.result as { tools: { name: string; annotations?: Record<string, boolean> }[] })
    .tools;
  expect(list).toHaveLength(64);
  expect(list.filter((t) => t.annotations?.readOnlyHint === true)).toHaveLength(25);
  expect(list.filter((t) => t.annotations?.readOnlyHint !== true)).toHaveLength(39);

  const names = list.map((t) => t.name);
  expect(names).toContain("log_time");
  expect(names).toContain("get_running_timer");
  expect(names).not.toContain("start_timer");
  expect(names).not.toContain("stop_timer");
  expect(names).not.toContain("start_favorite");
});

test("mcp: a revoked key stops working immediately", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;

  const created = await page.request.post("/api/keys", {
    headers: { origin },
    data: { name: "e2e revoke", scope: "read" },
  });
  const { plaintext, key } = (await created.json()) as {
    plaintext: string;
    key: { id: string };
  };
  const auth = { ...MCP_HEADERS, Authorization: `Bearer ${plaintext}` };

  const before = await page.request.post("/mcp", {
    headers: auth,
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(before.status()).toBe(200);

  const revoked = await page.request.delete(`/api/keys/${key.id}`, { headers: { origin } });
  expect(revoked.ok()).toBeTruthy();

  const after = await page.request.post("/mcp", {
    headers: auth,
    data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
  });
  expect(after.status()).toBe(401);
});
