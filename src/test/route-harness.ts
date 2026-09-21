import { Hono } from "hono";

type Vars = { workspaceId: string; userId: string };
// Some routers only read the workspace, so they declare fewer variables than the harness sets.
type Router = Hono<{ Bindings: Env; Variables: Vars }> | Hono<{ Bindings: Env; Variables: { workspaceId: string } }>;

/** A router mounted as one person in one workspace, over a real database; `request` returns the Response. */
export function routeClient(router: Router, db: D1Database, actor: { workspaceId: string; userId: string }) {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>()
    .use("*", async (c, next) => {
      c.set("workspaceId", actor.workspaceId);
      c.set("userId", actor.userId);
      await next();
    })
    .route("/", router as Hono<{ Bindings: Env; Variables: Vars }>);
  const timerRoom = { idFromName: () => "room", get: () => ({ fetch: async () => new Response("ok") }) };
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
  const env = { DB: db, TIMER_ROOM: timerRoom } as unknown as Env;

  const request = (path: string, init?: RequestInit) => app.request(path, init, env, ctx);
  const send = (method: string, path: string, body?: unknown) =>
    request(path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { request, get: (path: string) => request(path), post: (path: string, body: unknown) => send("POST", path, body),
    put: (path: string, body: unknown) => send("PUT", path, body), patch: (path: string, body?: unknown) => send("PATCH", path, body),
    del: (path: string, body?: unknown) => send("DELETE", path, body) };
}
