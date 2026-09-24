// Esc inside an in-place edit means "cancel this", not "close the dialog or sheet around it".
const EVENT = "escape-local";

/** For a dialog/sheet's `onEscapeKeyDown`: an Esc from a marked subtree keeps it open and goes to that subtree instead. */
export function keepOpenOnLocalEscape(event: KeyboardEvent) {
  const owner = event.target instanceof Element ? event.target.closest("[data-escape-local]") : null;
  if (!owner) return;
  event.preventDefault();
  owner.dispatchEvent(new Event(EVENT));
}

/** Only reached when no menu is open above (Radix hands Esc to the topmost layer), so a menu's own Esc never cancels. */
export const ESCAPE_LOCAL_EVENT = EVENT;
