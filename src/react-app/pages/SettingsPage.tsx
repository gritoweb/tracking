import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useEntries } from "@/hooks/useEntries";
import { exportToCSV } from "@/lib/exportUtils";
import { useUIStore } from "@/stores/uiStore";
import { useUpdateSettings } from "@/hooks/useSettings";
import { useRecolorProjects } from "@/hooks/useProjects";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { GeneralSettingsTab } from "@/components/settings/GeneralSettingsTab";
import { IntegrationsCard } from "@/components/integrations/IntegrationsCard";
import { CalendarSyncCard } from "@/components/settings/CalendarSyncCard";
import { ProductivityCard } from "@/components/settings/ProductivityCard";
import { DigestCard } from "@/components/settings/DigestCard";
import { McpConnectorCard } from "@/components/settings/McpConnectorCard";
import { AssistantMemoryCard } from "@/components/settings/AssistantMemoryCard";
import { RecurringEntriesCard } from "@/components/settings/RecurringEntriesCard";
import { TeamCard } from "@/components/settings/TeamCard";
import { AccountCard } from "@/components/settings/AccountCard";
import { SessionsCard } from "@/components/settings/SessionsCard";
import { ConnectedAccountsCard } from "@/components/settings/ConnectedAccountsCard";
import { PasskeysCard } from "@/components/settings/PasskeysCard";
import { DangerZoneCard } from "@/components/settings/DangerZoneCard";

const TABS = ["general", "tracking", "workspace", "account"] as const;
type Tab = (typeof TABS)[number];

// ── Settings page ────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { data: entries = [] } = useEntries(365);

  // — Preferences state
  const timeFormat = useUIStore((s) => s.timeFormat);
  const setTimeFormatStore = useUIStore((s) => s.setTimeFormat);
  const currency = useUIStore((s) => s.currency);
  const setCurrencyStore = useUIStore((s) => s.setCurrency);
  const weekStart = useUIStore((s) => s.weekStart);
  const setWeekStartStore = useUIStore((s) => s.setWeekStart);
  const showWeekends = useUIStore((s) => s.showWeekends);
  const setShowWeekendsStore = useUIStore((s) => s.setShowWeekends);
  const autoAssignColors = useUIStore((s) => s.autoAssignColors);
  const setAutoAssignColorsStore = useUIStore((s) => s.setAutoAssignColors);
  const updateSettings = useUpdateSettings();
  const recolorProjects = useRecolorProjects();
  // Recoloring every project is a workspace change: owners/admins only (D3).
  const { canManage } = useWorkspaceRole();

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleExportAll = () => {
    exportToCSV(entries, "all-time-entries");
  };

  const handleTimeFormatChange = (value: "24h" | "12h") => {
    setTimeFormatStore(value); // optimistic; server confirms via mutation
    updateSettings.mutate({ timeFormat: value });
  };

  const handleCurrencyChange = (value: string) => {
    setCurrencyStore(value); // optimistic; server confirms via mutation
    updateSettings.mutate({ currency: value });
  };

  const handleWeekStartChange = (value: string) => {
    const n = Number(value);
    setWeekStartStore(n); // optimistic; server confirms via mutation
    updateSettings.mutate({ weekStart: n });
  };

  const handleShowWeekendsChange = (checked: boolean) => {
    setShowWeekendsStore(checked); // optimistic; server confirms via mutation
    updateSettings.mutate({ showWeekends: checked });
  };

  const handleAutoAssignColorsChange = (checked: boolean) => {
    setAutoAssignColorsStore(checked); // optimistic; server confirms via mutation
    updateSettings.mutate({ autoAssignColors: checked });
  };

  // The active tab lives in the query string so a settings link can point at a
  // section and a reload lands where you were. Unknown values fall back rather
  // than rendering an empty page.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab = TABS.includes(requested as Tab) ? (requested as Tab) : "general";
  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/*
        Fifteen cards used to stack into one 3,808px scroll with 41 controls and
        no sectioning — the "config-everything settings screen" PRODUCT.md
        rejects by name. Four groups named for what you came to do, not for
        which subsystem owns the setting.

        The tab lives in the URL so /settings?tab=account is linkable and a
        reload doesn't dump you back at the top of General.
      */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4 space-y-4">
          <GeneralSettingsTab
            canManage={canManage}
            autoAssignColors={autoAssignColors}
            onAutoAssignColorsChange={handleAutoAssignColorsChange}
            onRecolorProjects={() => recolorProjects.mutate()}
            recoloringPending={recolorProjects.isPending}
            timeFormat={timeFormat}
            onTimeFormatChange={handleTimeFormatChange}
            currency={currency}
            onCurrencyChange={handleCurrencyChange}
            weekStart={weekStart}
            onWeekStartChange={handleWeekStartChange}
            showWeekends={showWeekends}
            onShowWeekendsChange={handleShowWeekendsChange}
          />
        </TabsContent>

        <TabsContent value="tracking" className="mt-4 space-y-4">
          <ProductivityCard />
          <DigestCard />
          <RecurringEntriesCard />
          <AssistantMemoryCard />
        </TabsContent>

        <TabsContent value="workspace" className="mt-4 space-y-4">
          <TeamCard />
          <CalendarSyncCard />
          <McpConnectorCard />
          <IntegrationsCard />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data export</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">
                Export all your time entries as a CSV file.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleExportAll}
              >
                <Download className="h-4 w-4" />
                Export all entries (CSV)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="mt-4 space-y-4">
          <AccountCard />
          <PasskeysCard />
          <ConnectedAccountsCard />
          <SessionsCard />
          <DangerZoneCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
