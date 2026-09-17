import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

// Declared here, not in @shared/schemas: this route is its only consumer.
const ClientErrorSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  route: z.string().max(300).optional(),
  kind: z.enum(["boundary", "route", "unhandledrejection", "api"]),
});

/** Sink for `src/react-app/lib/errorReporter.ts`; mounted behind `workspaceMiddleware`, so the log line has who. */
export const clientErrorsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>().post("/", zValidator("json", ClientErrorSchema), async (c) => {
  const { message, stack, route, kind } = c.req.valid("json");
  console.error("client error", {
    workspaceId: c.get("workspaceId"),
    userId: c.get("userId"),
    kind,
    route,
    message,
    stack,
  });
  return c.body(null, 204);
});
