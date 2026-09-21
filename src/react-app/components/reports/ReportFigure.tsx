import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const WIDTH = { percent: "w-9 shrink-0", amount: "w-20" } as const;

/** A quiet right-aligned number beside a report row's duration: its share of the total, or its amount. */
export function ReportFigure({ kind, children }: { kind: keyof typeof WIDTH; children: ReactNode }) {
  return <span className={cn(WIDTH[kind], "text-right text-xs tabular-nums text-muted-foreground")}>{children}</span>;
}
