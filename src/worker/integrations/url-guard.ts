import { IntegrationError } from "./types";

// SSRF guard for push-integration base URLs. The base_url is user-supplied and
// the worker fetches it server-side, so an unvetted value (an internal address,
// a non-https scheme, embedded credentials) would turn the worker into a
// request-forgery proxy from Cloudflare's egress. This resolves a base_url to a
// validated https origin or throws — every adapter runs it before any fetch.

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return true; // malformed dotted-quad → unsafe
  const [a, b] = o;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a >= 224 // multicast / reserved
  );
}

// Allow-list, not block-list: only global unicast (2000::/3) minus the ranges that embed or reserve
// addresses. IPv4-mapped (::ffff:), IPv4-compatible and NAT64 all fall outside 2000::/3, so
// `[::ffff:a9fe:a9fe]` (the cloud metadata address in disguise) is refused along with the rest.
function isPublicIPv6(literal: string): boolean {
  const [first = "", second = ""] = literal.split(":");
  if (literal.includes(".") || !first) return false;
  const head = parseInt(first, 16);
  if (Number.isNaN(head) || head < 0x2000 || head > 0x3fff) return false;
  const next = second ? parseInt(second, 16) : 0;
  if (head === 0x2001 && (next <= 0x01ff || next === 0x0db8)) return false; // protocol assignments (Teredo…), documentation
  if (head === 0x2002) return false; // 6to4 embeds an IPv4 address
  return true;
}

function isUnsafeHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.startsWith("[")) return !isPublicIPv6(h.replace(/^\[|\]$/g, ""));
  if (isPrivateIPv4(h)) return true;
  // A public host always has a dot (a registrable domain / TLD); a single-label
  // name resolves only on an internal network, so reject it.
  if (!h.includes(".")) return true;
  return false;
}

/**
 * Validate a user-supplied integration base URL and return its https origin.
 * Pass the provider `type` to additionally pin providers whose host space is
 * well-defined (Dynamics is always *.dynamics.com).
 */
export function safeIntegrationOrigin(
  baseUrl: string,
  type?: "workfront" | "dynamics",
): string {
  let raw = (baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!raw) throw new IntegrationError("Base URL is required.");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new IntegrationError("Base URL is not a valid URL.");
  }

  if (url.protocol !== "https:") throw new IntegrationError("Base URL must use https://.");
  if (url.username || url.password) throw new IntegrationError("Base URL must not embed credentials.");
  if (isUnsafeHost(url.hostname)) {
    throw new IntegrationError("Base URL must be a public host, not an internal or reserved address.");
  }
  if (type === "dynamics" && !url.hostname.toLowerCase().endsWith(".dynamics.com")) {
    throw new IntegrationError("Dynamics base URL must be a *.dynamics.com address.");
  }

  return url.origin;
}

/** A push must never be sent somewhere the base URL did not name, so a redirect is refused rather than followed. */
export async function fetchWithoutRedirect(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("Location");
    const host = location && URL.canParse(location, url) ? new URL(location, url).host : "";
    throw new IntegrationError(
      `The server redirected the request${host ? ` to ${host}` : ""}. Use that address as the base URL instead.`,
    );
  }
  return res;
}

const ERROR_READ_BYTES = 2048;
const ERROR_TEXT_CHARS = 200;

// Control characters, C1, and the Unicode line/paragraph separators: none may reach a person's screen from upstream text.
// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;

function flatten(text: string): string {
  return text.replace(UNSAFE_TEXT, " ").replace(/ {2,}/g, " ").trim();
}

/** Reads at most ERROR_READ_BYTES of an upstream error body, then drops the rest of the stream. */
async function readBodyHead(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < ERROR_READ_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } catch {
    // A broken stream still yields whatever arrived before it broke.
  } finally {
    await reader.cancel().catch((err) => console.warn("integration: could not cancel the upstream error stream", { cause: String(err) }));
  }
  const bytes = new Uint8Array(Math.min(total, ERROR_READ_BYTES));
  let at = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - at);
    bytes.set(part, at);
    at += part.length;
  }
  // stream: true and no flush, so a character cut by the byte cap is dropped rather than turned into U+FFFD.
  return decoder.decode(bytes, { stream: true });
}

/**
 * The message for a non-OK upstream reply: bounded read, one flat line, capped, and named after
 * the host it came from so upstream text can never pass as the app's own.
 */
export async function readUpstreamError(res: Response, origin: string): Promise<string> {
  const text = await readBodyHead(res);
  let message = text;
  try {
    const json = JSON.parse(text) as { error?: { message?: unknown }; message?: unknown };
    const fromJson = json?.error?.message ?? json?.message;
    if (typeof fromJson === "string") message = fromJson;
  } catch {
    // Not JSON (or cut mid-document): the raw text is the message.
  }
  const body = flatten(message).slice(0, ERROR_TEXT_CHARS) || res.statusText || `HTTP ${res.status}`;
  return `[${new URL(origin).host}] ${body}`;
}
