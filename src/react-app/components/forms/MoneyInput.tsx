import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { currencyLocale, currencySymbol, formatMoneyInput, parseMoney } from "@/lib/money";

interface MoneyInputProps {
  id?: string;
  /** null = blank; NaN while the text isn't a number yet. */
  value: number | null;
  onValueChange: (value: number | null) => void;
  currency: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/** An amount typed with a comma or a dot, shown back in the currency's own format once you leave the field. */
export function MoneyInput({ value, onValueChange, currency, className, ...props }: MoneyInputProps) {
  const locale = currencyLocale(currency);
  const [text, setText] = useState(() => formatMoneyInput(value, locale));
  const invalid = Number.isNaN(value) || (value !== null && value < 0);
  const symbol = currencySymbol(currency);

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
        {symbol}
      </span>
      <Input
        {...props}
        inputMode="decimal"
        autoComplete="off"
        className="pl-10 tabular-nums"
        aria-invalid={invalid}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onValueChange(parseMoney(e.target.value, locale));
        }}
        onBlur={() => {
          if (!invalid) setText(formatMoneyInput(value, locale));
        }}
      />
    </div>
  );
}
