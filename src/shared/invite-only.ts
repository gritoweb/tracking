/** Code and message returned whenever an account is refused for lack of an invitation. */
export const INVITE_ONLY_CODE = "INVITE_ONLY";

export const INVITE_ONLY_MESSAGE =
  "This app is invite-only. Ask a workspace admin to invite this email address.";

/** Whether an auth error (code, message, or Better Auth's underscored OAuth redirect form) is the invite-only refusal. */
export function isInviteOnlyError(error: string | null | undefined): boolean {
  if (!error) return false;
  return error === INVITE_ONLY_CODE || error.split("_").join(" ") === INVITE_ONLY_MESSAGE;
}
