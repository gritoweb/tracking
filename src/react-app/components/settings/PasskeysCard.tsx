import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingsListItem } from "./SettingsListItem";
import { authClient } from "@/lib/auth-client";
import { formatShortDate } from "@/lib/dateUtils";

// Just enough of the SDK's passkey shape for the confirm dialog's copy.
interface DeletablePasskey {
  id: string;
  name?: string | null;
}

function toIso(d: Date | string): string {
  return typeof d === "string" ? d : d.toISOString();
}

export function PasskeysCard() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeletablePasskey | null>(null);

  const { data: passkeys = [], isLoading } = useQuery({
    queryKey: ["auth", "passkeys"],
    queryFn: async () => {
      const { data, error } = await authClient.passkey.listUserPasskeys();
      if (error) throw new Error(error.message ?? "Failed to load passkeys");
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      // Triggers the browser's WebAuthn prompt. Returns undefined on user cancel.
      const res = await authClient.passkey.addPasskey({ name: name.trim() || undefined });
      if (res?.error) throw new Error(res.error.message ?? "Failed to add passkey");
    },
    onSuccess: () => {
      toast.success("Passkey added");
      setName("");
      queryClient.invalidateQueries({ queryKey: ["auth", "passkeys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await authClient.passkey.deletePasskey({ id });
      if (error) throw new Error(error.message ?? "Failed to remove passkey");
    },
    onSuccess: () => {
      toast.success("Passkey removed");
      queryClient.invalidateQueries({ queryKey: ["auth", "passkeys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Passkeys</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-normal text-muted-foreground">
          Sign in with Touch ID, Windows Hello, or a security key — no password needed.
        </p>

        {isLoading ? (
          <p className="text-sm leading-normal text-muted-foreground">Loading…</p>
        ) : passkeys.length > 0 ? (
          <div className="space-y-2">
            {passkeys.map((p) => (
              <SettingsListItem
                key={p.id}
                icon={KeyRound}
                title={<span className="truncate font-medium">{p.name || "Passkey"}</span>}
                subtitle={p.createdAt ? `Added ${formatShortDate(toIso(p.createdAt))}` : undefined}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Remove passkey"
                  onClick={() => setDeleteTarget(p)}
                  disabled={remove.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </SettingsListItem>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2 pt-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add.mutate()}
            placeholder="Passkey name (e.g. MacBook)"
            aria-label="Passkey name"
            className="h-8 text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => add.mutate()}
            disabled={add.isPending}
          >
            {add.isPending ? <Spinner size="sm" /> : <KeyRound className="h-3.5 w-3.5" />}
            Add passkey
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Remove passkey?"
        description={`"${deleteTarget?.name || "Passkey"}" will no longer sign you in. This can't be undone.`}
        confirmLabel="Remove"
        onConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </Card>
  );
}
