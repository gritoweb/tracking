import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { SettingsRow } from "./SettingsRow";
import { authClient } from "@/lib/auth-client";

export function DangerZoneCard() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const handleDeactivate = async () => {
    setPending(true);
    try {
      // The server serves this path as a deactivation (routes/account.ts); nothing is deleted.
      const { error } = await authClient.deleteUser();
      if (error) throw new Error(error.message ?? "Failed to deactivate account");
      toast.success("Your account has been deactivated");
      navigate("/login");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to deactivate account");
    } finally {
      setPending(false);
      setOpen(false);
    }
  };

  return (
    <Card tone="destructive">
      <CardHeader>
        <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
      </CardHeader>
      <CardContent>
        <SettingsRow
          label={<span className="text-sm font-medium text-foreground">Deactivate account</span>}
          description="Signs you out everywhere and removes you from your workspaces. Your tracked time stays with them."
        >
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => setOpen(true)}
          >
            Deactivate account
          </Button>
        </SettingsRow>
      </CardContent>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate your account?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll be signed out on every device and can't sign in again. Your time entries, tasks
              and comments stay in the workspace. A new invitation brings the account back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeactivate();
              }}
              disabled={pending}
              variant="destructive"
            >
              {pending && <Spinner size="sm" className="mr-1.5" />}
              Deactivate account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
