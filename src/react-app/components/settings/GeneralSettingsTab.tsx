import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Palette } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { CURRENCIES } from "@/lib/currency";
import { SettingsRow } from "./SettingsRow";

interface GeneralSettingsTabProps {
  canManage: boolean;
  autoAssignColors: boolean;
  onAutoAssignColorsChange: (checked: boolean) => void;
  onRecolorProjects: () => void;
  recoloringPending: boolean;
  timeFormat: "24h" | "12h";
  onTimeFormatChange: (value: "24h" | "12h") => void;
  currency: string;
  onCurrencyChange: (value: string) => void;
  weekStart: number;
  onWeekStartChange: (value: string) => void;
  showWeekends: boolean;
  onShowWeekendsChange: (checked: boolean) => void;
}

/** The "General" settings tab: appearance, shortcuts and display preferences. */
export function GeneralSettingsTab({
  canManage,
  autoAssignColors,
  onAutoAssignColorsChange,
  onRecolorProjects,
  recoloringPending,
  timeFormat,
  onTimeFormatChange,
  currency,
  onCurrencyChange,
  weekStart,
  onWeekStartChange,
  showWeekends,
  onShowWeekendsChange,
}: GeneralSettingsTabProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingsRow label="Theme" description="Choose light, dark, or system default">
            <ThemeToggle />
          </SettingsRow>

          <Separator />

          <SettingsRow
            htmlFor="pref-autocolor"
            label={
              <span className="flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5" />
                Auto-assign colors
              </span>
            }
            description={
              <>
                Give new projects a distinct color automatically.
                {canManage && ' "Apply to existing" uses AI to color your current projects distinctly.'}
              </>
            }
          >
            <div className="flex items-center gap-2">
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRecolorProjects}
                  // Reads as actionable while the setting it belongs to is off,
                  // which is the one state where pressing it contradicts the
                  // switch beside it.
                  disabled={recoloringPending || !autoAssignColors}
                  title={
                    autoAssignColors
                      ? "Spread distinct colors across your existing projects"
                      : "Turn on auto-assign colors to recolor existing projects"
                  }
                >
                  {recoloringPending ? <Spinner size="sm" /> : "Apply to existing"}
                </Button>
              )}
              <Switch
                id="pref-autocolor"
                checked={autoAssignColors}
                onCheckedChange={onAutoAssignColorsChange}
              />
            </div>
          </SettingsRow>
        </CardContent>
      </Card>

      {/* Keyboard shortcuts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keyboard shortcuts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Start / Stop timer</span>
            <Kbd className="px-2">Alt+Shift+S</Kbd>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Discard running timer</span>
            <Kbd className="px-2">Alt+Shift+X</Kbd>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <SettingsRow label="Time display format" description="How times are shown throughout the app">
            <SegmentedControl
              label="Time display format"
              options={[
                { value: "24h", label: "24h" },
                { value: "12h", label: "12h" },
              ]}
              value={timeFormat}
              onChange={onTimeFormatChange}
            />
          </SettingsRow>

          <Separator />

          <SettingsRow
            htmlFor="pref-currency"
            label="Currency"
            description="Used for billable amounts in reports"
          >
            <Select value={currency} onValueChange={onCurrencyChange}>
              <SelectTrigger className="w-48 text-sm" id="pref-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>

          <Separator />

          <SettingsRow
            htmlFor="pref-week-start"
            label="Week starts on"
            description="First day of the week in the calendar and timesheet"
          >
            <Select value={String(weekStart)} onValueChange={onWeekStartChange}>
              <SelectTrigger className="w-48 text-sm" id="pref-week-start">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Sunday</SelectItem>
                <SelectItem value="1">Monday</SelectItem>
                <SelectItem value="6">Saturday</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>

          <Separator />

          <SettingsRow
            htmlFor="pref-weekends"
            label="Show weekends"
            description="Include Saturday and Sunday columns on the calendar"
          >
            <Switch id="pref-weekends" checked={showWeekends} onCheckedChange={onShowWeekendsChange} />
          </SettingsRow>
        </CardContent>
      </Card>
    </>
  );
}
