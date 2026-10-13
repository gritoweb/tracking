import { useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { SettingsCardHeader } from "./SettingsCardHeader";
import { SettingsRow } from "./SettingsRow";
import { SettingsHint } from "./SettingsHint";
import { useReportSettings, useUpdateReportSettings } from "@/hooks/useReportSettings";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { CURRENCIES } from "@/lib/currency";
import type { ReportSettings } from "@shared/schemas";
import { REPORT_DEFAULT_COLORS } from "@shared/colors";

const HEX = /^#[0-9a-fA-F]{6}$/;
const COLOR_FIELDS = [
  { key: "primary", label: "Primary", description: "Titles, invoice number and the total" },
  { key: "accent", label: "Accent", description: "The stripe under the header and the table headings" },
  { key: "text", label: "Text", description: "Body text; muted text and lines are derived from it" },
] as const;

/** Logo, colours, currency and the default hourly rate of the client PDFs (invoice, hours report). */
export function ReportBrandingCard() {
  const { data: settings } = useReportSettings();
  const { canManage } = useWorkspaceRole();
  if (!settings) {
    return (
      <Card>
        <SettingsCardHeader title="Invoices" />
        <CardContent>
          <Skeleton className="h-60 w-full" />
        </CardContent>
      </Card>
    );
  }
  // The form remounts only when its own saved values change, so replacing the logo never drops unsaved edits.
  const { logoUrl, ...fields } = settings;
  return (
    <Card>
      <SettingsCardHeader title="Invoices" />
      <CardContent className="space-y-5">
        {!canManage && <SettingsHint>Only workspace owners and admins can change these.</SettingsHint>}
        <LogoRow logoUrl={logoUrl} canManage={canManage} />
        <Separator />
        <FieldsForm key={JSON.stringify(fields)} settings={settings} canManage={canManage} />
      </CardContent>
    </Card>
  );
}

function LogoRow({ logoUrl, canManage }: { logoUrl: string | null; canManage: boolean }) {
  const save = useUpdateReportSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const disabled = !canManage || save.isPending;
  return (
    <SettingsRow label="Logo" description="PNG or JPEG, up to 1 MB. Shown at the top of every document.">
      <div className="flex items-center gap-2">
        {logoUrl && <img src={logoUrl} alt="Report logo" className="h-10 max-w-32 rounded-md bg-muted object-contain p-1" />}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) save.mutate({ kind: "logo", file });
            e.target.value = "";
          }}
        />
        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={disabled} onClick={() => fileInput.current?.click()}>
          <ImageUp className="h-3.5 w-3.5" />
          {logoUrl ? "Replace" : "Upload"}
        </Button>
        {logoUrl && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove logo"
            title="Remove logo"
            disabled={disabled}
            onClick={() => save.mutate({ kind: "removeLogo" })}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </SettingsRow>
  );
}

function FieldsForm({ settings, canManage }: { settings: ReportSettings; canManage: boolean }) {
  const save = useUpdateReportSettings();
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [companyEmail, setCompanyEmail] = useState(settings.companyEmail);
  const [currency, setCurrency] = useState(settings.currency);
  const [defaultRate, setDefaultRate] = useState<number | null>(settings.defaultRate);
  const [colors, setColors] = useState<ReportSettings["colors"]>(settings.colors);

  const colorsValid = Object.values(colors).every((c) => HEX.test(c));
  const rateValid = defaultRate === null || defaultRate >= 0;

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!colorsValid || !rateValid) return;
        save.mutate({
          kind: "fields",
          data: {
            companyName: companyName.trim() || null,
            companyEmail: companyEmail.trim() || null,
            currency,
            defaultRate,
            colors,
          },
        });
      }}
    >
      <SettingsRow htmlFor="report-company" label="Company name" description="Used when there is no logo, and in the footer">
        <Input id="report-company" className="sm:w-64" value={companyName} disabled={!canManage} onChange={(e) => setCompanyName(e.target.value)} />
      </SettingsRow>
      <SettingsRow htmlFor="report-email" label="Contact email" description="Under the logo on the invoice">
        <Input id="report-email" type="email" className="sm:w-64" value={companyEmail} disabled={!canManage} onChange={(e) => setCompanyEmail(e.target.value)} />
      </SettingsRow>
      <SettingsRow htmlFor="report-currency" label="Currency" description="What invoices bill in, whatever each person's display currency">
        <Select value={currency} onValueChange={setCurrency} disabled={!canManage}>
          <SelectTrigger id="report-currency" className="sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow htmlFor="report-rate" label="Default hourly rate" description="For every client without a rate of its own">
        <MoneyInput
          // A new currency re-reads the amount in that currency's format.
          key={currency}
          id="report-rate"
          className="sm:w-40"
          currency={currency}
          value={defaultRate}
          disabled={!canManage}
          onValueChange={setDefaultRate}
        />
      </SettingsRow>

      <Separator />

      {COLOR_FIELDS.map(({ key, label, description }) => {
        const value = colors[key];
        const valid = HEX.test(value);
        const set = (next: string) => setColors((c) => ({ ...c, [key]: next }));
        return (
          <SettingsRow key={key} htmlFor={`report-color-${key}`} label={label} description={description}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`${label} colour picker`}
                value={valid ? value.toLowerCase() : REPORT_DEFAULT_COLORS[key]}
                disabled={!canManage}
                onChange={(e) => set(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-full border bg-transparent p-0.5 disabled:cursor-not-allowed"
              />
              <Input
                id={`report-color-${key}`}
                className="w-28"
                value={value}
                disabled={!canManage}
                aria-invalid={!valid}
                spellCheck={false}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  set(v.startsWith("#") || v === "" ? v : `#${v}`);
                }}
              />
            </div>
          </SettingsRow>
        );
      })}

      {canManage && (
        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending || !colorsValid || !rateValid}>Save</Button>
        </div>
      )}
    </form>
  );
}
