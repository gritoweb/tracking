/** The decimal separator a currency is written with in its home locale (BRL → ",", USD → "."). */
export function currencyLocale(currency: string): string {
  return currency === "BRL" ? "pt-BR" : "en-US";
}

function decimalSeparator(locale: string): string {
  return new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === "decimal")?.value ?? ".";
}

/**
 * Reads what a person typed as an amount, with a comma or a dot as the decimal mark.
 * The last separator is the decimal one unless exactly three digits follow it, where
 * the locale decides ("1.000" is a thousand in pt-BR, one in en-US). Blank → null; junk → NaN.
 */
export function parseMoney(text: string, locale: string): number | null {
  const t = text.replace(/[^\d.,-]/g, "");
  if (t === "") return text.trim() === "" ? null : NaN;
  const last = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  if (last === -1) return Number(t);
  const sep = t[last];
  const decimals = t.length - last - 1;
  const isDecimal = decimals !== 3 || (sep === decimalSeparator(locale) && t.indexOf(sep) === last);
  const int = (isDecimal ? t.slice(0, last) : t).replace(/[.,]/g, "");
  const n = Number(isDecimal ? `${int}.${t.slice(last + 1)}` : int);
  return Number.isFinite(n) ? n : NaN;
}

/** 1234.5 → "1.234,50" (pt-BR) / "1,234.50" (en-US): how an amount reads back in its field. */
export function formatMoneyInput(value: number | null, locale: string): string {
  return value === null ? "" : new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** "R$" / "$": the prefix shown in the field. */
export function currencySymbol(currency: string): string {
  return (
    new Intl.NumberFormat(currencyLocale(currency), { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}

/** "R$ 1.234,50" / "$1,234.50": an amount in its currency's own format, whatever the browser's language. */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(currencyLocale(currency), { style: "currency", currency }).format(amount);
}
