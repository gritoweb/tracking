import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { NO_CLIENT, type ClientChoice } from "@/lib/clientChoice";
import type { Client } from "@shared/schemas";

// Radix rejects an empty item value, and "" already means "nothing chosen".
const NEW_CLIENT = "__new_client__";

interface ClientFieldProps {
  value: ClientChoice;
  onChange: (value: ClientChoice) => void;
  clients: Client[];
  /** Toolbar density (the project picker's popover) instead of form density. */
  compact?: boolean;
  id?: string;
  autoFocus?: boolean;
}

/** Pick the project's client or name a new one here — a workspace with no clients must not dead-end mid-entry. */
export function ClientField({
  value,
  onChange,
  clients,
  compact = false,
  id,
  autoFocus = false,
}: ClientFieldProps) {
  const [naming, setNaming] = useState(false);
  const creating = clients.length === 0 || naming;

  if (creating) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          value={value.newName}
          autoFocus={autoFocus}
          onChange={(e) => onChange({ clientId: "", newName: e.target.value })}
          // The picker renders this inside a cmdk Command, which steals arrows and Enter.
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={clients.length ? "New client name" : "Client name"}
          aria-label="New client name"
          className={cn(compact && "h-7 text-xs")}
        />
        {clients.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size={compact ? "icon-xs" : "icon-sm"}
            aria-label="Pick an existing client"
            title="Pick an existing client"
            onClick={() => {
              setNaming(false);
              onChange(NO_CLIENT);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <Select
      value={value.clientId}
      onValueChange={(next) => {
        if (next === NEW_CLIENT) {
          setNaming(true);
          onChange(NO_CLIENT);
          return;
        }
        onChange({ clientId: next, newName: "" });
      }}
    >
      <SelectTrigger
        id={id}
        size={compact ? "sm" : "default"}
        className={cn("w-full", compact && "h-7 text-xs")}
        aria-label="Client for the project"
      >
        <SelectValue placeholder="Choose a client" />
      </SelectTrigger>
      <SelectContent>
        {clients.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={NEW_CLIENT}>New client…</SelectItem>
      </SelectContent>
    </Select>
  );
}
