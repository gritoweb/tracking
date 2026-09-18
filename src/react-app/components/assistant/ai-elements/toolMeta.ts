import {
  Play,
  Square,
  Clock,
  CalendarClock,
  ListTree,
  BarChart3,
  Trash2,
  Brain,
  Wrench,
} from "lucide-react";
import type { UIMessage } from "ai";

export type ToolPart = UIMessage["parts"][number];

// Humanized labels + icons for the assistant's tools (part.type is `tool-<name>`). Used
// for the pending/busy line and as the fallback for unknown tools.
export const TOOLS: Record<string, { label: string; icon: typeof Play }> = {
  startTimer: { label: "Start timer", icon: Play },
  stopTimer: { label: "Stop timer", icon: Square },
  logTimeEntry: { label: "Log time entry", icon: Clock },
  trackMeeting: { label: "Track meeting", icon: CalendarClock },
  getTimeSummary: { label: "Time summary", icon: BarChart3 },
  listProjects: { label: "List projects", icon: ListTree },
  deleteEntry: { label: "Delete entry", icon: Trash2 },
  rememberPreference: { label: "Remember", icon: Brain },
  searchMemory: { label: "Recall", icon: Brain },
};

export function toolMetaFor(name: string) {
  return TOOLS[name] ?? { label: name || "Tool", icon: Wrench };
}

export function toolNameOf(part: ToolPart): string {
  return typeof part.type === "string" && part.type.startsWith("tool-")
    ? part.type.slice("tool-".length)
    : "";
}
