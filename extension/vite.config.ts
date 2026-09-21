import { readFile, writeFile } from "node:fs/promises";
import { defineConfig, type Plugin, type ResolvedConfig } from "vite";
import react from "@vitejs/plugin-react";
import { join, resolve } from "path";
import { appAliases } from "@timetracker/vite-config";

const DEV_ORIGIN = "localhost:5173";

interface Manifest {
  host_permissions?: string[];
  content_scripts?: { matches: string[] }[];
  [key: string]: unknown;
}

// Guards the store package: no localhost fallback for the app URL, no dev origin in the manifest.
function extensionPackageGuards(): Plugin {
  let resolved: ResolvedConfig;
  return {
    name: "extension-package-guards",
    configResolved(config) {
      resolved = config;
      if (config.mode !== "development" && !config.env.VITE_APP_URL) {
        throw new Error(
          "VITE_APP_URL is not defined: set it in the repo root .env or the environment before building the extension package (only --mode development may fall back to localhost)."
        );
      }
    },
    // Written after the bundle so the transformed manifest, not the source copy, is what ships.
    async writeBundle() {
      const manifest = JSON.parse(await readFile(resolve(__dirname, "manifest.json"), "utf8")) as Manifest;
      if (resolved.mode !== "development") {
        const keep = (entry: string) => !entry.includes(DEV_ORIGIN);
        manifest.host_permissions = manifest.host_permissions?.filter(keep);
        for (const script of manifest.content_scripts ?? []) script.matches = script.matches.filter(keep);
      }
      const outDir = resolve(resolved.root, resolved.build.outDir);
      await writeFile(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

// Separate Vite build for the Chrome extension (MV3)
export default defineConfig({
  plugins: [react(), extensionPackageGuards()],
  // The app URL lives in the repo root .env; the extension's own root has none.
  envDir: resolve(__dirname, ".."),
  build: {
    outDir: "../dist/extension",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup/index.html"),
        "background/service-worker": resolve(
          __dirname,
          "background/service-worker.ts"
        ),
        "content/content-script": resolve(
          __dirname,
          "content/content-script.ts"
        ),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  resolve: {
    alias: appAliases(resolve(__dirname, "..")),
  },
});
