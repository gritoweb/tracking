import { authClient } from "@/lib/auth-client";
import { clearPendingMutations } from "@/lib/idb";

export function useAuth() {
  const { data: session, isPending } = authClient.useSession();
  return {
    user: session?.user ?? null,
    session: session?.session ?? null,
    isLoading: isPending,
    signOut: async () => {
      // Cleared first so a failed sign-out request can't leave one person's writes for the next session.
      await clearPendingMutations().catch((err: unknown) =>
        console.warn("couldn't clear the offline queue", err)
      );
      return authClient.signOut();
    },
  };
}
