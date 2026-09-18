import { Fragment } from "react";
import { Link } from "react-router-dom";
import { appPath } from "@/lib/appPath";

// Deliberately tiny markdown renderer — the assistant runs on Llama, which emits plain
// prose with the occasional list or **bold**. This avoids pulling in streamdown
// + shiki (heavy) for output that never contains code blocks or tables. Handles
// paragraphs, bullet lists, inline bold, inline `code` and [links](url).

export function AssistantLink({ label, href }: { label: string; href: string }) {
  const className = "font-medium text-primary-ink underline underline-offset-2 hover:no-underline";
  const path = appPath(href, window.location.origin);
  if (path) return <Link to={path} className={className}>{label}</Link>;
  if (/^https?:\/\//.test(href)) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{label}</a>;
  }
  // javascript:, data: and the like are shown as plain text, never as a link.
  return <>{label}</>;
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Alternating split on **bold**, `code` and [text](url).
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("[")) {
      const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/) ?? [];
      nodes.push(<AssistantLink key={`${keyPrefix}-l${i}`} label={label ?? token} href={href ?? ""} />);
    } else {
      nodes.push(
        <code key={`${keyPrefix}-c${i}`} className="rounded bg-muted px-1 py-0.5 text-xs">
          {token.slice(1, -1)}
        </code>
      );
    }
    last = m.index + token.length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function AssistantMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: string) => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={key} className="list-disc space-y-0.5 pl-4">
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b, `${key}-${i}`)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flushBullets(`ul-${idx}`);
    if (trimmed) {
      blocks.push(
        <p key={`p-${idx}`} className="whitespace-pre-wrap">
          {renderInline(trimmed, `p-${idx}`)}
        </p>
      );
    }
  });
  flushBullets("ul-end");

  return <div className="space-y-2 text-sm leading-relaxed">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
