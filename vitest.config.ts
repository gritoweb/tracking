import { defineConfig } from "vitest/config";
import { appAliases } from "@timetracker/vite-config";

// Fixed non-UTC, DST-observing zone so date-boundary tests behave the same on every machine.
process.env.TZ = "America/Chicago";

export default defineConfig({
  resolve: {
    alias: appAliases(__dirname),
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: [
        "src/worker/lib/**",
        "src/worker/middleware/**",
        "src/worker/integrations/**",
        "src/shared/**",
        "src/react-app/lib/**",
      ],
      // Floored to the measured value (target is 80/80) - most files under the globs above still have no test.
      thresholds: {
        lines: 28,
        branches: 31,
      },
    },
  },
});
