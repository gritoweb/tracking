import { describe, expect, it } from "vitest";
import { currencySymbol, formatMoney, formatMoneyInput, parseMoney } from "./money";

describe("parseMoney", () => {
  it.each([
    ["100", "pt-BR", 100],
    ["100,5", "pt-BR", 100.5],
    ["100.5", "pt-BR", 100.5],
    ["1.234,56", "pt-BR", 1234.56],
    ["1,234.56", "pt-BR", 1234.56],
    ["1.000", "pt-BR", 1000],
    ["1.000", "en-US", 1],
    ["1,000", "en-US", 1000],
    ["1,000", "pt-BR", 1],
    ["1.000.000", "en-US", 1000000],
    ["R$ 65,00", "pt-BR", 65],
    ["$65.00", "en-US", 65],
    ["0,99", "pt-BR", 0.99],
  ])("%s in %s is %d", (text, locale, expected) => {
    expect(parseMoney(text, locale)).toBe(expected);
  });

  it("treats blank as no value and junk as invalid", () => {
    expect(parseMoney("  ", "pt-BR")).toBeNull();
    expect(parseMoney("abc", "pt-BR")).toBeNaN();
    expect(parseMoney("1,2,3,4", "pt-BR")).toBe(123.4);
  });
});

describe("formatMoneyInput", () => {
  it("writes the amount the way the currency's locale does", () => {
    expect(formatMoneyInput(1234.5, "pt-BR")).toBe("1.234,50");
    expect(formatMoneyInput(1234.5, "en-US")).toBe("1,234.50");
    expect(formatMoneyInput(null, "pt-BR")).toBe("");
  });

  it("formats an amount by its currency, not the browser's language", () => {
    expect(formatMoney(35, "BRL").replace(/\s/g, " ")).toBe("R$ 35,00");
    expect(formatMoney(35, "USD")).toBe("$35.00");
  });

  it("knows the symbol", () => {
    expect(currencySymbol("BRL")).toBe("R$");
    expect(currencySymbol("USD")).toBe("$");
  });
});
