// Every logged entry is born billable; only an explicit user toggle turns it off.

export const DEFAULT_ENTRY_BILLABLE = true;

/** An explicit true/false always wins; anything else (undefined/null) is billable. */
export function resolveEntryBillable(explicit?: boolean | null): boolean {
  return explicit ?? DEFAULT_ENTRY_BILLABLE;
}
