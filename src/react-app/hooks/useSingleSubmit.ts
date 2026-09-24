import { useRef, useState } from "react";

/**
 * One submit at a time for a form: a second Enter or click while the first is still in flight is dropped,
 * so impatience can't create the same record twice. Call `settle` from the mutation's `onSettled`.
 */
export function useSingleSubmit() {
  // A ref, not the state: two key presses can land before React re-renders with `pending`.
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);

  const run = (action: (settle: () => void) => void) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    action(() => {
      inFlight.current = false;
      setPending(false);
    });
  };

  return { run, pending };
}
