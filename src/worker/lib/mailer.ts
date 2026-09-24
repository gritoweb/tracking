import { render, toPlainText } from "react-email";
import type { ReactElement } from "react";


// RFC 2606/6761 names that can never be a real inbox; the e2e suite invites `@outsider.test` people.
const RESERVED_DOMAIN = /(^|\.)(test|example|invalid|localhost)$|^example\.(com|net|org)$/i;

/** Real delivery only from a deployed app to a real domain; anything else is logged instead (see CHANGELOG 2026-09-24). */
export function shouldDeliver(appUrl: string | undefined, to: string): boolean {
  const domain = to.split("@").pop() ?? "";
  if (RESERVED_DOMAIN.test(domain)) return false;
  try {
    const host = new URL(appUrl ?? "").hostname;
    return host !== "localhost" && !host.startsWith("127.") && host !== "[::1]";
  } catch {
    return false;
  }
}

/** Send one React Email template via Resend (not the `send_email` binding: see docs/ARCHITECTURE.md "Email"). */
export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  email: ReactElement
): Promise<void> {
  const html = await render(email);
  const text = toPlainText(html);
  if (!shouldDeliver(env.APP_URL, to)) {
    // Local dev and tests: the code or link a person would have received is read from the log.
    console.info(`[mailer] not sent (local or test address) to=${to} subject=${subject}\n${text}`);
    return;
  }
  // Config, not code, like APP_URL; missing means refuse rather than guess a sender.
  if (!env.EMAIL_FROM) throw new Error("EMAIL_FROM is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
}
