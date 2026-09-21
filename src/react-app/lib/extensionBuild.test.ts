// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { build, resolveConfig, type InlineConfig } from "vite";

const ROOT = resolve(__dirname, "../../..");
const DEV_ORIGIN = "localhost:5173";
const PROD_URL = "https://tracking.gritoweb.com.br";
let outDir: string;
let scratch: string[];

beforeEach(async () => {
  scratch = [];
  outDir = await mkdtemp(join(tmpdir(), "ext-build-"));
  scratch.push(outDir);
  vi.stubEnv("VITE_APP_URL", PROD_URL);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

function extensionBuild(mode: string, extra: InlineConfig = {}) {
  return build({
    root: resolve(ROOT, "extension"),
    configFile: resolve(ROOT, "extension/vite.config.ts"),
    mode,
    logLevel: "silent",
    build: { outDir, emptyOutDir: true, minify: true },
    ...extra,
  });
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)]))
  );
  return nested.flat();
}

async function everythingShipped(): Promise<string> {
  const files = await filesUnder(outDir);
  return (await Promise.all(files.map((f) => readFile(f, "utf8")))).join("\n");
}

describe("extension production package", () => {
  it("ships the localhost dev origin nowhere: not in any script, chunk or the manifest", async () => {
    await extensionBuild("production");
    expect(await readdir(outDir)).toContain("manifest.json");
    expect(await everythingShipped()).not.toContain(DEV_ORIGIN);
  }, 60_000);

  it("still lists the production host and plain localhost API access in the manifest", async () => {
    await extensionBuild("production");
    const manifest = JSON.parse(await readFile(join(outDir, "manifest.json"), "utf8"));
    expect(manifest.host_permissions).toEqual(["http://localhost/*", "https://tracking.gritoweb.com.br/*"]);
    expect(manifest.content_scripts[0].matches).toContain("https://tracking.gritoweb.com.br/*");
  }, 60_000);

  it("reads VITE_APP_URL from the repo root .env directory, not from extension/", async () => {
    const config = await resolveConfig(
      { root: resolve(ROOT, "extension"), configFile: resolve(ROOT, "extension/vite.config.ts") },
      "build"
    );
    expect(config.envDir).toBe(ROOT);
  });

  it("fails instead of falling back to localhost when VITE_APP_URL is defined nowhere", async () => {
    vi.stubEnv("VITE_APP_URL", undefined);
    const emptyEnvDir = await mkdtemp(join(tmpdir(), "ext-env-"));
    scratch.push(emptyEnvDir);

    await expect(extensionBuild("production", { envDir: emptyEnvDir })).rejects.toThrow(/VITE_APP_URL/);
  }, 60_000);

  it("fails when VITE_APP_URL is set but empty", async () => {
    vi.stubEnv("VITE_APP_URL", "");
    await expect(extensionBuild("production")).rejects.toThrow(/VITE_APP_URL/);
  }, 60_000);
});

describe("extension development build", () => {
  it("keeps the localhost dev origin in the content script and the manifest", async () => {
    await extensionBuild("development");
    const script = await readFile(join(outDir, "content/content-script.js"), "utf8");
    const manifest = await readFile(join(outDir, "manifest.json"), "utf8");
    expect(script).toContain(`http://${DEV_ORIGIN}`);
    expect(manifest).toContain(`http://${DEV_ORIGIN}/*`);
  }, 60_000);

  it("may build without VITE_APP_URL, since nothing is shipped from it", async () => {
    vi.stubEnv("VITE_APP_URL", undefined);
    const emptyEnvDir = await mkdtemp(join(tmpdir(), "ext-env-"));
    scratch.push(emptyEnvDir);

    await expect(extensionBuild("development", { envDir: emptyEnvDir })).resolves.toBeDefined();
  }, 60_000);
});
