import { Hono } from "hono";
import { getMemberRole, canManageWorkspace } from "../lib/permissions";

// Who the caller is in the active workspace, so the UI can hide what the server refuses anyway.
export const meRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>().get("/", async (c) => {
  const role = await getMemberRole(c.env.DB, c.get("workspaceId"), c.get("userId"));
  return c.json({
    userId: c.get("userId"),
    workspaceId: c.get("workspaceId"),
    role,
    canManage: canManageWorkspace(role),
  });
});
