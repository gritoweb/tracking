import {
  CalendarClock,
  Clock,
  BarChart3,
  Trash2,
  Brain,
  Search,
  Plus,
  Pencil,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { UIMessage } from "ai";

export type ToolPart = UIMessage["parts"][number];

// The chat-only tools; every other tool comes from the MCP catalog and is labelled from its name.
const CHAT_TOOLS: Record<string, { label: string; icon: LucideIcon }> = {
  trackMeeting: { label: "Track meeting", icon: CalendarClock },
  rememberPreference: { label: "Remember", icon: Brain },
  searchMemory: { label: "Recall", icon: Brain },
};

/** An MCP tool name as a label: `list_tasks` → "List tasks". */
export function humanizeToolName(name: string): string {
  const words = name.replace(/_/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Tool";
}

function iconFor(name: string): LucideIcon {
  if (name === "log_time" || name === "copy_week") return Clock;
  if (name === "get_time_summary" || name === "run_report" || name === "get_project_pacing") return BarChart3;
  if (name === "draft_day") return CalendarClock;
  if (/^(delete|archive)_/.test(name)) return Trash2;
  if (/^(create|add|upload)_/.test(name)) return Plus;
  if (/^(update|edit|move|set|mark)_/.test(name)) return Pencil;
  if (/^(list|get|whoami)/.test(name)) return Search;
  return Wrench;
}

export function toolMetaFor(name: string): { label: string; icon: LucideIcon } {
  return CHAT_TOOLS[name] ?? { label: humanizeToolName(name), icon: iconFor(name) };
}

export function toolNameOf(part: ToolPart): string {
  return typeof part.type === "string" && part.type.startsWith("tool-")
    ? part.type.slice("tool-".length)
    : "";
}
