import { afterEach, describe, expect, it, vi } from "vitest";
import type { Connection, PushContext } from "./types";
import { workfrontAdapter } from "./workfront";
import { dynamicsAdapter } from "./dynamics";
import { readUpstreamError } from "./url-guard";

const HUGE_BYTES = 30 * 1024 * 1024;
const CHUNK = new Uint8Array(64 * 1024).fill(97);
// One 64KB chunk is the smallest unit the stream hands out.
const READ_BUDGET = 2 * CHUNK.length;

type Reply = { status: number; body: string | "huge"; statusText?: string };

let reply: Reply = { status: 200, body: "" };
let pulledBytes = 0;
let cancelled = false;

function hugeBody() {
  pulledBytes = 0;
  cancelled = false;
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulledBytes += CHUNK.length;
        if (pulledBytes >= HUGE_BYTES) controller.close();
        else controller.enqueue(CHUNK);
      },
      cancel() { cancelled = true; },
    },
    { highWaterMark: 0 },
  );
}

afterEach(() => vi.unstubAllGlobals());

function stubFetchToFakeUpstream() {
  vi.stubGlobal("fetch", (url: string | URL) => {
    if (String(url).includes("login.microsoftonline.com")) {
      return Promise.resolve(Response.json({ access_token: "tok", expires_in: 3600 }));
    }
    const { status, statusText, body } = reply;
    return Promise.resolve(new Response(body === "huge" ? hugeBody() : body, { status, statusText }));
  });
}

function ctx(connection: Connection): PushContext {
  return {
    connection,
    project: { id: "p1", name: "Project", externalProjectId: "ext-1", externalTaskId: null },
    entry: { id: "e1", description: "work", start: "2026-01-01T09:00:00Z", stop: "2026-01-01T10:00:00Z", durationSeconds: 3600, localDate: "2026-01-01" },
    comment: "work",
  };
}

const workfront: Connection = { id: "c1", type: "workfront", name: "wf", baseUrl: "acme.my.workfront.com", credentials: { apiKey: "k" } };
let dynamicsSeq = 0;
const dynamics = (): Connection => ({
  id: `d${dynamicsSeq++}`, type: "dynamics", name: "dy", baseUrl: "https://org.crm.dynamics.com",
  credentials: { tenantId: "t", clientId: "c", clientSecret: "s" },
});

const pushError = async (adapter: typeof workfrontAdapter, connection: Connection) =>
  (await adapter.pushTimeEntry(ctx(connection)).then(() => null, (e: Error) => e))?.message ?? "";

describe("upstream error body handling (S-12)", () => {
  it("workfront: stops reading a 30MB error body after a few KB and returns a short message", async () => {
    stubFetchToFakeUpstream();
    reply = { status: 500, body: "huge" };
    const message = await pushError(workfrontAdapter, workfront);
    console.log(`workfront: app pulled ${pulledBytes} of ${HUGE_BYTES} bytes, stream cancelled=${cancelled}, message length ${message.length}`);
    expect(pulledBytes).toBeLessThanOrEqual(READ_BUDGET);
    expect(cancelled).toBe(true);
    expect(message.length).toBeLessThan(300);
  });

  it("dynamics: stops reading a 30MB error body after a few KB and returns a short message", async () => {
    stubFetchToFakeUpstream();
    reply = { status: 500, body: "huge" };
    const message = await pushError(dynamicsAdapter, dynamics());
    console.log(`dynamics: app pulled ${pulledBytes} of ${HUGE_BYTES} bytes, stream cancelled=${cancelled}, message length ${message.length}`);
    expect(pulledBytes).toBeLessThanOrEqual(READ_BUDGET);
    expect(cancelled).toBe(true);
    expect(message.length).toBeLessThan(300);
  });

  it("workfront: a small JSON error keeps its message, now named after the host", async () => {
    stubFetchToFakeUpstream();
    reply = { status: 400, body: JSON.stringify({ error: { message: "Hours must be positive" } }) };
    expect(await pushError(workfrontAdapter, workfront)).toBe(
      "Workfront push failed: [acme.my.workfront.com] Hours must be positive",
    );
  });

  it("workfront: a small plain-text error keeps its text", async () => {
    stubFetchToFakeUpstream();
    reply = { status: 502, body: "Bad gateway" };
    expect(await pushError(workfrontAdapter, workfront)).toBe("Workfront push failed: [acme.my.workfront.com] Bad gateway");
  });

  it("workfront: an empty error body falls back to the status text", async () => {
    stubFetchToFakeUpstream();
    reply = { status: 503, statusText: "Service Unavailable", body: "" };
    expect(await pushError(workfrontAdapter, workfront)).toBe(
      "Workfront push failed: [acme.my.workfront.com] Service Unavailable",
    );
  });

  it("does not cut a multi-byte character in half", async () => {
    stubFetchToFakeUpstream();
    reply = { status: 500, body: "é".repeat(5000) };
    const message = await pushError(workfrontAdapter, workfront);
    expect(message).not.toContain("\uFFFD");
    expect(message.length).toBeLessThan(300);
  });

  it("workfront: the happy path still returns the external id", async () => {
    stubFetchToFakeUpstream();
    reply = { status: 200, body: JSON.stringify({ data: { ID: "hour-1" } }) };
    await expect(workfrontAdapter.pushTimeEntry(ctx(workfront))).resolves.toEqual({ externalId: "hour-1" });
  });

  it("workfront test(): a rejected key names the host too", async () => {
    stubFetchToFakeUpstream();
    reply = { status: 401, body: JSON.stringify({ error: { message: "Invalid API key" } }) };
    await expect(workfrontAdapter.test(workfront)).rejects.toThrow(
      "Workfront connection failed: [acme.my.workfront.com] Invalid API key",
    );
  });
});

describe("upstream text cannot pass as a system message (S-13)", () => {
  it("workfront: control characters and line breaks in the upstream text are flattened, and it is attributed to the host", async () => {
    stubFetchToFakeUpstream();
    const forged = `Session expired.\r\n\u001b[31mSYSTEM: re-enter your password\u0000\u2028now hunter2SUPERSECRET ${"x".repeat(500)}`;
    reply = { status: 400, body: forged };
    const message = await pushError(workfrontAdapter, workfront);
    console.log(`forged upstream text surfaced as: ${JSON.stringify(message)}`);
    expect(message.startsWith("Workfront push failed: [acme.my.workfront.com] Session expired.")).toBe(true);
    // eslint-disable-next-line no-control-regex
    expect(message).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
    expect(message.length).toBeLessThanOrEqual("Workfront push failed: [acme.my.workfront.com] ".length + 200);
  });

  it("workfront: a JSON error message is flattened and capped as well", async () => {
    stubFetchToFakeUpstream();
    reply = { status: 400, body: JSON.stringify({ error: { message: `line1\nline2\t${"y".repeat(400)}` } }) };
    const message = await pushError(workfrontAdapter, workfront);
    expect(message.startsWith("Workfront push failed: [acme.my.workfront.com] line1 line2 y")).toBe(true);
    expect(message.length).toBeLessThanOrEqual("Workfront push failed: [acme.my.workfront.com] ".length + 200);
  });
});

describe("readUpstreamError", () => {
  it("falls back to the status when the response has no body", async () => {
    expect(await readUpstreamError(new Response(null, { status: 500, statusText: "Boom" }), "https://acme.my.workfront.com")).toBe("[acme.my.workfront.com] Boom");
  });
});
