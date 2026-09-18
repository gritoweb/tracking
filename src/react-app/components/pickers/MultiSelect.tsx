import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClearButton } from "@/components/ui/clear-button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { ColorDot } from "@/components/ColorDot";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  color?: string;
  /** Present (even null) for a person option — renders a round photo/initials avatar instead of a ColorDot. */
  image?: string | null;
}

interface MultiSelectProps {
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
  /** True while `options` is still loading — shows "Loading…" instead of "No X found", which otherwise misreads as empty. */
  loading?: boolean;
  /** Replaces the default label+count button — e.g. a card's own avatar cluster, so picking doesn't need the full form open. */
  trigger?: ReactNode;
  /** Closes the popover right after a pick — the assignee picker's own single-tap expectation, not the filter bar's multi-pick one. */
  closeOnSelect?: boolean;
  /** Controlled open state — a caller that opens the picker itself (typing "@" in a comment). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function OptionMark({ option }: { option: MultiSelectOption }) {
  if (option.image !== undefined) {
    return <UserAvatar name={option.label} image={option.image} className="h-4 w-4 text-micro" />;
  }
  if (option.color) return <ColorDot color={option.color} />;
  return null;
}

/**
 * Generic multi-select combobox (Popover + Command) with removable badge
 * chips. Used by the reports filter bar for clients / projects / tasks /
 * tags, and by the task assignee pickers (D6), whose options carry `image`.
 */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  className,
  loading = false,
  trigger,
  closeOnSelect = false,
  open: controlledOpen,
  onOpenChange,
}: MultiSelectProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    if (closeOnSelect) setOpen(false);
  };

  const selectedOptions = value
    .map((v) => options.find((o) => o.value === v))
    .filter((o): o is MultiSelectOption => Boolean(o));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {trigger ?? (
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 text-sm",
              value.length === 0 && "text-muted-foreground",
              className
            )}
          >
            <span>{label}</span>
            {value.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-0.5 h-5 min-w-5 justify-center px-1 tabular-nums"
              >
                {value.length}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        {selectedOptions.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b p-2">
            {selectedOptions.map((o) => (
              <Badge
                key={o.value}
                variant="secondary"
                className="gap-1 text-xs font-normal"
              >
                <OptionMark option={o} />
                <span className="max-w-32 truncate">{o.label}</span>
                <ClearButton aria-label={`Remove ${o.label}`} onClick={() => toggle(o.value)} />
              </Badge>
            ))}
          </div>
        )}
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}...`} className="h-9" />
          <CommandList>
            <CommandEmpty>{loading ? "Loading…" : `No ${label.toLowerCase()} found`}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  keywords={[o.label]}
                  onSelect={() => toggle(o.value)}
                >
                  <OptionMark option={o} />
                  <span className="truncate">{o.label}</span>
                  {value.includes(o.value) && (
                    <Check className="ml-auto h-3.5 w-3.5 shrink-0" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
