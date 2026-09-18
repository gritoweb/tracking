import { describe, expect, it } from "vitest";
import {
  buildClaudeCodeSetupPrompt,
  buildClaudeDesktopConfig,
  buildCursorConfig,
  buildGenericAiInstructions,
} from "./mcpSetupPrompt";

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

describe("client configs", () => {
  const url = "https://example.test/mcp";

  it("Cursor config is valid JSON carrying the URL and bearer header", () => {
    const parsed = JSON.parse(buildCursorConfig(url, "tt_live_abc"));
    expect(parsed.mcpServers.tracking).toEqual({ url, headers: { Authorization: "Bearer tt_live_abc" } });
  });

  it("Claude Desktop config keeps the key in env and no space after the header colon", () => {
    const parsed = JSON.parse(buildClaudeDesktopConfig(url, "tt_live_abc"));
    const server = parsed.mcpServers.tracking;
    expect(server.env.TT_AUTH).toBe("Bearer tt_live_abc");
    expect(JSON.stringify(server.args)).not.toContain("tt_live_abc");
    expect(server.args).toContain("Authorization:${TT_AUTH}");
  });

  it("generic instructions name the URL, the transport and the header", () => {
    const text = buildGenericAiInstructions(url, "tt_live_abc");
    expect(text).toContain(url);
    expect(text).toContain("Authorization: Bearer tt_live_abc");
    expect(text).toContain("Streamable HTTP");
  });
});
