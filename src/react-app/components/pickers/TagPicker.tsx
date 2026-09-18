import { useState } from "react";
import { Tag, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ClearButton } from "@/components/ui/clear-button";
import { ColorSwatchPicker } from "@/components/ui/color-swatch-picker";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ColorDot, DEFAULT_PROJECT_COLOR } from "@/components/ColorDot";
import { useCreateTag, useTags, useUpdateTag } from "@/hooks/useProjects";

interface TagPickerProps {
  value: string[];
  onChange: (tags: string[]) => void;
  className?: string;
  /**
   * Render the trigger as a form field — bordered, full width — instead of the
   * ghost chip used in dense toolbars. See ProjectPicker.
   */
  field?: boolean;
}

export function TagPicker({
  value,
  onChange,
  className,
  field = false,
}: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  // Tag name currently being recolored via the inline swatch row, if any.
  const [recoloring, setRecoloring] = useState<string | null>(null);
  const { data: allTags = [] } = useTags();
  const updateTag = useUpdateTag();
  const createTag = useCreateTag();

  const byName = new Map(allTags.map((t) => [t.name, t]));
  // Untinted tags fall back to the shared swatch default rather than a
  // one-off hex, so the neutral reads the same as an untinted project dot.
  const colorOf = (name: string) => byName.get(name)?.color ?? DEFAULT_PROJECT_COLOR;

  const query = input.trim();
  const suggestions = allTags
    .map((t) => t.name)
    .filter(
      (name) =>
        name.toLowerCase().includes(query.toLowerCase()) && !value.includes(name)
    );
  const canCreate = query.length > 0 && !suggestions.some((s) => s === query);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
      // Created now, not on save: the chip shows the row's own colour.
      if (!byName.has(trimmed)) createTag.mutate(trimmed);
    }
    setInput("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !input && value.length) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={field ? "outline" : "ghost"}
          size="sm"
          // The visible label counts tags without naming them ("2 tags"), which
          // tells a screen-reader user nothing about what's applied.
          aria-label={value.length > 0 ? `Tags: ${value.join(", ")}` : "Add tags"}
          className={cn(
            "h-7 gap-1.5 px-2 text-sm text-muted-foreground",
            value.length > 0 && "text-foreground",
            field && "h-9 w-full justify-start px-3 font-normal",
            className
          )}
        >
          <Tag className="h-3.5 w-3.5" />
          {value.length > 0 ? (
            <span>
              {value.length} tag{value.length > 1 ? "s" : ""}
            </span>
          ) : (
            <span>Tags</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        {value.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b p-2">
            {value.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="gap-1 text-xs font-normal"
              >
                {/* The tag is created as it is added, so this is its real colour. */}
                {byName.has(tag) ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Recolor ${tag}`}
                        onClick={() => setRecoloring((cur) => (cur === tag ? null : tag))}
                        // inline-flex, or the dot inside stays an inline span and Tailwind's size is ignored.
                        className="focus-ring inline-flex rounded-full ring-offset-1 transition-transform duration-fast ease-out-quart hover:scale-125"
                      >
                        <ColorDot color={colorOf(tag)} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Change color</TooltipContent>
                  </Tooltip>
                ) : (
                  <ColorDot color={colorOf(tag)} />
                )}
                {tag}
                <ClearButton aria-label={`Remove ${tag}`} onClick={() => removeTag(tag)} />
              </Badge>
            ))}
          </div>
        )}

        {/* Inline recolor palette for the tag whose dot was clicked. */}
        {recoloring && byName.has(recoloring) && (
          <div className="border-b p-2">
            <ColorSwatchPicker
              size="sm"
              value={colorOf(recoloring)}
              aria-label={`Recolor ${recoloring}`}
              onChange={(color) => {
                const t = byName.get(recoloring);
                if (t) updateTag.mutate({ id: t.id, color });
                setRecoloring(null);
              }}
            />
          </div>
        )}
        <Command shouldFilter={false}>
          <CommandInput
            value={input}
            onValueChange={setInput}
            onKeyDown={handleKeyDown}
            placeholder="Add a tag..."
            className="h-9"
          />
          <CommandList>
            {!suggestions.length && !canCreate && (
              <CommandEmpty>No tags found</CommandEmpty>
            )}
            {suggestions.length > 0 && (
              <CommandGroup>
                {suggestions.slice(0, 8).map((tag) => (
                  <CommandItem key={tag} value={tag} onSelect={() => addTag(tag)}>
                    <ColorDot color={colorOf(tag)} />
                    {tag}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {canCreate && (
              <CommandGroup>
                <CommandItem
                  value={`create-${query}`}
                  onSelect={() => addTag(query)}
                  className="text-primary"
                >
                  <Plus className="h-3 w-3" />
                  Create "{query}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
