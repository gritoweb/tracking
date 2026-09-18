import { CalendarClock, Brain, Search } from "lucide-react";
import { ToolResultCard } from "./ToolResultCard";
import { AssistantLink } from "./AssistantMarkdown";
import { toolMetaFor } from "./toolMeta";

type Rec = Record<string, unknown>;

function str(o: Rec, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function isOk(o: Rec): boolean {
  return o.ok !== false;
}
/** " · Acme" style project suffix, or "" when unprojected. */
function projectSuffix(o: Rec): string {
  const p = str(o, "project");
  return p ? ` · ${p}` : "";
}

/** First readable label of a catalog item: its name, description or title. */
function itemLabel(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Rec;
  return str(o, "name") ?? str(o, "description") ?? str(o, "title") ?? null;
}

export interface ResultLink {
  label: string;
  url: string;
}

const MAX_LINKS = 5;

/** The openable things a catalog tool's result names: any item (or list of items) carrying a `url`. */
export function linksOf(out: unknown): ResultLink[] {
  const items = Array.isArray(out) ? out : [out];
  return items
    .flatMap((item): ResultLink[] => {
      if (!item || typeof item !== "object") return [];
      const rec = item as Rec;
      const url = str(rec, "url");
      return url ? [{ label: itemLabel(rec) ?? url, url }] : [];
    })
    .slice(0, MAX_LINKS);
}

/** One-liner for a catalog tool's result: a refusal, a count with the first few names, or the item touched. */
function genericSummary(o: Rec): string | null {
  if (o.ok === false) return String(o.reason ?? "Couldn't complete that.");
  if (Array.isArray(o)) {
    const names = o.map(itemLabel).filter(Boolean).slice(0, 3);
    return `${o.length} result${o.length === 1 ? "" : "s"}${names.length ? ` · ${names.join(", ")}` : ""}`;
  }
  const bits: string[] = [];
  const label = itemLabel(o);
  if (label) bits.push(label);
  if (typeof o.message === "string" && o.message) bits.push(o.message);
  if (typeof o.totalHours === "number" || typeof o.totalHours === "string") bits.push(`${o.totalHours}h total`);
  return bits.join(" · ") || null;
}

// ---------------------------------------------------------------------------
// Per-tool result cards for the chat-only tools; catalog tools use the generic card.
// ---------------------------------------------------------------------------

/** The finished/errored result card for a tool call, keyed by tool name. */
export function renderToolResult(name: string, input: Rec, out: Rec): React.ReactNode {
  switch (name) {
    case "trackMeeting":
      if (!isOk(out))
        return (
          <ToolResultCard icon={CalendarClock} tone="error" title={str(out, "reason") ?? "Couldn't track meeting"} />
        );
      return (
        <ToolResultCard
          icon={CalendarClock}
          tone="ok"
          title={`Tracked meeting · ${str(out, "durationHours") ?? "0"}h${projectSuffix(out)}`}
        />
      );

    case "rememberPreference":
      return (
        <ToolResultCard icon={Brain} tone="ok" title="Remembered">
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{str(out, "key") ?? str(input, "key") ?? "?"}</code>
        </ToolResultCard>
      );

    case "searchMemory": {
      const memories = (out.memories as string[] | undefined) ?? [];
      return (
        <ToolResultCard icon={Search} title={`Recalled ${memories.length} fact${memories.length === 1 ? "" : "s"}`}>
          {memories.length > 0 && (
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {memories.slice(0, 4).map((m, i) => (
                <li key={i} className="truncate">
                  {m}
                </li>
              ))}
              {memories.length > 4 && (
                <li className="text-micro italic text-muted-foreground/70">+{memories.length - 4} more</li>
              )}
            </ul>
          )}
        </ToolResultCard>
      );
    }

    default: {
      // Unknown tool — fall back to a generic one-line summary.
      const meta = toolMetaFor(name);
      const summary = genericSummary(out);
      const links = linksOf(out);
      return (
        <ToolResultCard icon={meta.icon} tone={isOk(out) ? "muted" : "warn"} title={meta.label}>
          {summary}
          {links.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {links.map((link) => (
                <li key={link.url} className="truncate">
                  <AssistantLink label={link.label} href={link.url} />
                </li>
              ))}
            </ul>
          )}
        </ToolResultCard>
      );
    }
  }
}
