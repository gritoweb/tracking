import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { appAliases } from "@timetracker/vite-config";

// @cloudflare/vite-plugin copies the root .dev.vars into dist/tracking/ for `vite preview`; deploys don't need it.
// Set KEEP_DEV_VARS=1 on a build that a local `vite preview` will serve.
function stripDevVarsFromBuild(): Plugin {
  return {
    name: "strip-dev-vars-from-build",
    apply: "build",
    generateBundle: {
      order: "post",
      handler(_, bundle) {
        if (process.env.KEEP_DEV_VARS) return;
        delete bundle[".dev.vars"];
      },
    },
  };
}

export default defineConfig({
  // In CI there's no Cloudflare login, so the remote-only AI binding can't start
  // its proxy session and the dev server fails to boot. Disable remote bindings
  // in CI (no e2e test hits the AI endpoint); local dev keeps them for real use.
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({ remoteBindings: !process.env.CI }),
    stripDevVarsFromBuild(),
  ],
  resolve: {
    alias: appAliases(__dirname),
  },
});
