import { Plus, Copy, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface PlannerToolbarProps {
  onAddRow: () => void;
  onCopyLastWeek: () => void;
  onImport: () => void;
  copying: boolean;
}

/** The Add row / Copy last week / Import CSV cluster — also the empty state's action set. */
export function PlannerToolbar({ onAddRow, onCopyLastWeek, onImport, copying }: PlannerToolbarProps) {
  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={onAddRow}>
        <Plus className="h-4 w-4" />
        Add row
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={onCopyLastWeek} disabled={copying}>
        {copying ? <Spinner /> : <Copy className="h-4 w-4" />}
        Copy last week's plan
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={onImport}>
        <Upload className="h-4 w-4" />
        Import CSV
      </Button>
    </>
  );
}
