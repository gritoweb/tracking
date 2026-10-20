import { Hono } from "hono";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from "@shared/attachments";
import type { Context, Next } from "hono";
import { clientIp, limitRequest, tooManyRequests } from "../middleware/rate-limit";
import { UPLOAD_ID, stageUpload, stagingKey, verifyUploadGrant } from "../lib/uploads";

const TOO_LARGE = `File is larger than ${MAX_ATTACHMENT_LABEL}`;
// Multipart framing around the file itself.
const MULTIPART_SLACK_BYTES = 64 * 1024;

// One budget per address across both doors (a signed URL's path differs per token), so staging can't fill the bucket.
const UPLOADS_PER_MINUTE = import.meta.env.DEV ? 1000 : 30;
async function uploadRateLimit(c: Context<{ Bindings: Env }>, next: Next) {
  const retryAfter = await limitRequest(c.env, { key: `uploads:${clientIp(c.req.raw.headers)}`, max: UPLOADS_PER_MINUTE, windowMs: 60_000 });
  if (retryAfter !== null) return tooManyRequests(retryAfter);
  await next();
}

/** Mounted at /api/uploads: the signed-in app stages a file (the Assistant's composer) before a task is chosen. */
export const uploadsRouter = new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>().post("/", uploadRateLimit, async (c) => {
  const declaredBytes = Number(c.req.header("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_ATTACHMENT_BYTES + MULTIPART_SLACK_BYTES) {
    return c.json({ error: TOO_LARGE }, 413);
  }
  const file = (await c.req.parseBody()).file;
  if (!(file instanceof File)) return c.json({ error: "Missing file" }, 400);
  if (file.size > MAX_ATTACHMENT_BYTES) return c.json({ error: TOO_LARGE }, 413);
  const uploadId = crypto.randomUUID();
  const filename = file.name || "file";
  await stageUpload(c.env.ATTACHMENTS, stagingKey(c.get("workspaceId"), c.get("userId"), uploadId), await file.arrayBuffer(), filename);
  return c.json({ uploadId, filename, size: file.size }, 201);
});

/** Mounted at /api/uploads/signed, ahead of the session middleware: the URL's token is the only credential. */
export const signedUploadRouter = new Hono<{ Bindings: Env }>().put("/:token", uploadRateLimit, async (c) => {
  const grant = await verifyUploadGrant(c.env.BETTER_AUTH_SECRET, c.req.param("token") ?? "");
  if (!grant || !UPLOAD_ID.test(grant.uploadId)) return c.json({ error: "This upload link is invalid or expired; ask for a new one" }, 403);
  // Required so an oversized body is refused before it is read into memory.
  const declaredBytes = Number(c.req.header("content-length"));
  if (!Number.isFinite(declaredBytes) || c.req.header("content-length") === undefined) {
    return c.json({ error: "Content-Length is required" }, 411);
  }
  if (declaredBytes > MAX_ATTACHMENT_BYTES) return c.json({ error: TOO_LARGE }, 413);
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) return c.json({ error: TOO_LARGE }, 413);
  if (bytes.byteLength === 0) return c.json({ error: "The file is empty" }, 400);
  await stageUpload(c.env.ATTACHMENTS, stagingKey(grant.workspaceId, grant.userId, grant.uploadId), bytes, grant.filename);
  return c.json({ uploadId: grant.uploadId, filename: grant.filename, size: bytes.byteLength }, 201);
});
