import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// The repo's own ESLint config, run on snippets: the rules against swallowed errors must keep firing.
const eslint = new ESLint();

async function messages(code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: "src/react-app/lib/snippet.ts" });
  return result.messages.filter((m) => m.ruleId === "no-restricted-syntax" || m.ruleId === "no-empty").map((m) => m.message);
}

describe("swallowed-error lint rules", () => {
  // Loading the repo's whole ESLint config takes seconds under a parallel run; pay it once here, not inside the first case's 5s.
  beforeAll(() => messages(""), 60_000);

  it.each([
    ["an empty handler", "export const a = fetch('/x').catch(() => {});"],
    ["a handler returning undefined", "export const a = fetch('/x').catch(() => undefined);"],
    ["a handler returning null", "export const a = fetch('/x').catch(() => null);"],
    ["a handler returning an empty array", "export const a = fetch('/x').catch(() => []);"],
    ["an empty catch block", "export function f() { try { g(); } catch {} } function g() {}"],
    ["an onError that drops its argument", "export const o = { onError: () => toast() }; function toast() {}"],
  ])("flags %s", async (_name, code) => {
    expect((await messages(code)).length).toBeGreaterThan(0);
  });

  it.each([
    ["a handler that logs the error", "export const a = fetch('/x').catch((e) => console.warn('x', e));"],
    ["a catch block that says why it ignores the error", "export function f() { try { g(); } catch { /* the socket is already closed */ } } function g() {}"],
    ["the JSON parse fallback", "export const a = fetch('/x').then((r) => r.json().catch(() => null));"],
  ])("allows %s", async (_name, code) => {
    expect(await messages(code)).toEqual([]);
  });
});
