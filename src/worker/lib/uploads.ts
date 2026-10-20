// Staged uploads: a file sent before its task is known, held until upload_task_attachment moves it onto one.

/** How long a signed upload URL works. */
export const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;

/** Each person's staged files live under their own prefix, so an upload id alone never reaches someone else's file. */
export const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function stagingKey(workspaceId: string, userId: string, uploadId: string): string {
  if (!UPLOAD_ID.test(uploadId)) throw new Error("upload id must be a UUID");
  return `staging/${workspaceId}/${userId}/${uploadId}`;
}

export interface UploadGrant {
  workspaceId: string;
  userId: string;
  uploadId: string;
  filename: string;
  expiresAt: number;
}

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));
}

// Its own key, derived from the auth secret, so no other signature made with that secret can pass for an upload grant.
async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  const derived = await crypto.subtle.digest("SHA-256", encoder.encode(`upload-grant:${secret}`));
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** A token naming who may PUT which upload until when; the URL carries it, so nothing else authenticates the PUT. */
export async function signUploadGrant(secret: string, grant: UploadGrant): Promise<string> {
  const payload = base64url(encoder.encode(JSON.stringify(grant)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(payload));
  return `${payload}.${base64url(new Uint8Array(signature))}`;
}

/** The grant a token carries, or null when it is malformed, tampered with or expired. */
export async function verifyUploadGrant(secret: string, token: string, now = Date.now()): Promise<UploadGrant | null> {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), fromBase64url(signature), encoder.encode(payload));
    if (!valid) return null;
    const grant = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as UploadGrant;
    return grant.expiresAt > now ? grant : null;
  } catch {
    return null;
  }
}

export async function stageUpload(bucket: R2Bucket, key: string, bytes: Uint8Array | ArrayBuffer, filename: string): Promise<void> {
  await bucket.put(key, bytes, { customMetadata: { filename } });
}

/** The staged file as a File named the way it was sent, or null when there is none (expired, taken, someone else's). */
export async function readStaged(bucket: R2Bucket, key: string): Promise<File | null> {
  const object = await bucket.get(key);
  if (!object) return null;
  return new File([await object.arrayBuffer()], object.customMetadata?.filename || "file");
}
