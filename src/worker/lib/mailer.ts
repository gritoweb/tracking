import { render, toPlainText } from "react-email";
import type { ReactElement } from "react";

export const FROM_ADDRESS = "noreply@gritoweb.com.br";

/**
 * Send one React Email template via the Resend API.
 *
 * Not the Cloudflare `send_email` binding: that requires Email Routing enabled
 * on the zone, which forces the domain's MX to Cloudflare's — gritoweb.com.br's
 * existing MX serve the company's real mail, so that path is off the table.
 * Resend only needs the domain verified for sending (TXT/DKIM/CNAME, no MX),
 * which it already was.
 */
export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  email: ReactElement
): Promise<void> {
  const html = await render(email);
  const text = toPlainText(html);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
}
