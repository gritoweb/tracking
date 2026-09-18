import { format, parseISO } from "date-fns";
import type { TaskActivity } from "@shared/schemas";
import { PRIORITY_LABEL } from "@/lib/taskUtils";

export interface ActivitySegment {
  text: string;
  /** The value that changed, set apart from the sentence around it. */
  strong?: boolean;
}

const plain = (text: string): ActivitySegment => ({ text });
const value = (text: string): ActivitySegment => ({ text, strong: true });

const day = (iso: string) => format(parseISO(iso), "d MMM yyyy");
const priority = (n: string) => PRIORITY_LABEL[Number(n)] ?? n;

/** The sentence after the person's name, as segments so the changed values can be emphasised. */
export function describeActivity(a: TaskActivity): ActivitySegment[] {
  switch (a.kind) {
    case "status":
      return a.from
        ? [plain("changed status from "), value(a.from), plain(" to "), value(a.to ?? "")]
        : [plain("set status to "), value(a.to ?? "")];
    case "due_date":
      if (!a.to) return [plain("removed the due date")];
      return a.from
        ? [plain("changed the due date from "), value(day(a.from)), plain(" to "), value(day(a.to))]
        : [plain("set the due date to "), value(day(a.to))];
    case "priority":
      return a.from
        ? [plain("changed priority from "), value(priority(a.from)), plain(" to "), value(priority(a.to ?? ""))]
        : [plain("set priority to "), value(priority(a.to ?? ""))];
    case "assignees": {
      const parts: ActivitySegment[] = [];
      if (a.to) parts.push(plain("assigned "), value(a.to));
      if (a.to && a.from) parts.push(plain(" and "));
      if (a.from) parts.push(plain("unassigned "), value(a.from));
      return parts;
    }
  }
}
