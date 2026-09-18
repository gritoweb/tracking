import { Play, Square, Clock, CalendarClock, ListTree, BarChart3, Trash2, Brain, Search } from "lucide-react";
import { ToolResultCard } from "./ToolResultCard";
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

/** Best-effort one-liner for a tool we don't have a bespoke card for. */
function genericSummary(o: Rec): string | null {
  if (o.ok === false) return String(o.reason ?? "Couldn't complete that.");
  const bits: string[] = [];
  if (typeof o.project === "string" && o.project) bits.push(o.project);
  if (typeof o.durationHours === "string") bits.push(`${o.durationHours}h`);
  if (typeof o.totalHours === "string") bits.push(`${o.totalHours}h total`);
  if (typeof o.note === "string" && o.note) bits.push(o.note);
  return bits.join(" · ") || null;
}

// ---------------------------------------------------------------------------
// Per-tool result cards. Each maps one tool's output shape (see
// worker/lib/assistant-tools.ts) to a compact at-a-glance card.
// ---------------------------------------------------------------------------

/** The finished/errored result card for a tool call, keyed by tool name. */
export function renderToolResult(name: string, input: Rec, out: Rec): React.ReactNode {
  switch (name) {
    case "startTimer":
      return (
        <ToolResultCard icon={Play} tone="ok" title={`Started timer${projectSuffix(out)}`}>
          <span>{out.billable ? "Billable" : "Non-billable"}</span>
          {str(out, "note") && <span> · {str(out, "note")}</span>}
        </ToolResultCard>
      );

    case "stopTimer":
      if (!isOk(out))
        return <ToolResultCard icon={Square} tone="warn" title={str(out, "reason") ?? "No timer running"} />;
      return (
        <ToolResultCard icon={Square} tone="ok" title={`Stopped timer · ${str(out, "durationHours") ?? "0"}h`} />
      );

    case "logTimeEntry":
      if (!isOk(out))
        return <ToolResultCard icon={Clock} tone="error" title={str(out, "reason") ?? "Couldn't log entry"} />;
      return (
        <ToolResultCard
          icon={Clock}
          tone="ok"
          title={`Logged ${str(out, "durationHours") ?? "0"}h${projectSuffix(out)}`}
        >
          {str(out, "note") && <span>{str(out, "note")}</span>}
        </ToolResultCard>
      );

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

    case "getTimeSummary": {
      const byProject =
        (out.byProject as Array<{ project?: string; hours?: string; entries?: number }> | undefined) ?? [];
      return (
        <ToolResultCard icon={BarChart3} title={`${str(out, "totalHours") ?? "0"}h tracked`}>
          <div className="text-foreground/80">{str(out, "billableHours") ?? "0"}h billable</div>
          {byProject.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1">
              {byProject.slice(0, 6).map((r, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-foreground/90">{r.project ?? "No project"}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{r.hours ?? "0"}h</span>
                </li>
              ))}
              {byProject.length > 6 && (
                <li className="text-micro italic text-muted-foreground/70">+{byProject.length - 6} more</li>
              )}
            </ul>
          )}
        </ToolResultCard>
      );
    }

    case "listProjects": {
      const projects = (out.projects as Array<{ name?: string; billable?: boolean }> | undefined) ?? [];
      return (
        <ToolResultCard icon={ListTree} title={`${projects.length} project${projects.length === 1 ? "" : "s"}`}>
          {projects.length > 0 && (
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {projects.slice(0, 8).map((p, i) => (
                <li key={i} className="flex items-center gap-1.5 truncate">
                  <span className="truncate text-foreground/90">{p.name ?? "?"}</span>
                  {p.billable && <span className="text-micro text-success-ink">billable</span>}
                </li>
              ))}
              {projects.length > 8 && (
                <li className="text-micro italic text-muted-foreground/70">+{projects.length - 8} more</li>
              )}
            </ul>
          )}
        </ToolResultCard>
      );
    }

    case "deleteEntry":
      if (!isOk(out))
        return <ToolResultCard icon={Trash2} tone="warn" title={str(out, "reason") ?? "Nothing deleted"} />;
      return <ToolResultCard icon={Trash2} tone="ok" title="Deleted entry" />;

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
      return (
        <ToolResultCard icon={meta.icon} tone={isOk(out) ? "muted" : "warn"} title={meta.label}>
          {summary}
        </ToolResultCard>
      );
    }
  }
}
