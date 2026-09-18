import { describe, expect, it } from "vitest";
import { buildClaudeCodeSetupPrompt } from "./mcpSetupPrompt";

describe("buildClaudeCodeSetupPrompt", () => {
  const prompt = buildClaudeCodeSetupPrompt("https://example.test/mcp", "tt_live_abc");

  it("registers the Streamable HTTP server with the key as a header", () => {
    expect(prompt).toContain(
      'claude mcp add --transport http --scope user --header "Authorization: Bearer tt_live_abc" tracking https://example.test/mcp'
    );
    expect(prompt).not.toMatch(/\bSSE\b/);
  });

  it("installs a /tracking skill and says how to use it", () => {
    expect(prompt).toContain("~/.claude/skills/tracking/SKILL.md");
    expect(prompt).toContain("name: tracking");
    expect(prompt).toContain("just type /tracking");
  });
});
