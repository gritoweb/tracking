import { useRef, useState, type ReactNode } from "react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { anchorAt } from "@/lib/caret";

interface MenuState<T> {
  items: T[];
  rect: DOMRect | null;
  index: number;
  pick: (item: T) => void;
}

/**
 * A tiptap suggestion ("@", "/") as a list beside the caret: keyboard navigation, pick and dismiss.
 * The editor keeps `render()`'s handlers for its whole life, so they read the live list through a ref.
 */
export function useSuggestionMenu<T>() {
  const [state, setState] = useState<MenuState<T> | null>(null);
  const stateRef = useRef<MenuState<T> | null>(null);
  const set = (next: MenuState<T> | null) => {
    stateRef.current = next;
    setState(next);
  };

  const choose = (item: T) => {
    const s = stateRef.current;
    if (!s) return;
    s.pick(item);
    set(null);
  };

  /** For `suggestion.render`; `toPick` turns the plugin's props into "insert this item". */
  const render =
    <A,>(toPick: (props: SuggestionProps<T, A>) => (item: T) => void) =>
    () => {
      const show = (props: SuggestionProps<T, A>) =>
        set({ items: props.items, rect: props.clientRect?.() ?? null, index: 0, pick: toPick(props) });
      return {
        onStart: show,
        onUpdate: show,
        onKeyDown: ({ event }: SuggestionKeyDownProps) => {
          const s = stateRef.current;
          if (!s || s.items.length === 0) return false;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            const step = event.key === "ArrowDown" ? 1 : -1;
            set({ ...s, index: (s.index + step + s.items.length) % s.items.length });
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            choose(s.items[s.index]);
            return true;
          }
          if (event.key === "Escape") {
            set(null);
            return true;
          }
          return false;
        },
        onExit: () => set(null),
      };
    };

  const popover = (list: (items: T[], active: number) => ReactNode, className = "w-64 p-1") => (
    <Popover open={state !== null && state.items.length > 0} onOpenChange={(next) => !next && set(null)}>
      <PopoverAnchor virtualRef={anchorAt(state?.rect ?? null)} />
      <PopoverContent
        align="start"
        className={className}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {state && list(state.items, state.index)}
      </PopoverContent>
    </Popover>
  );

  return { render, choose, popover };
}
