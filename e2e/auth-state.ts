import { tmpdir } from "node:os";
import { join } from "node:path";

// Outside the repo (os.tmpdir()) so no .gitignore entry is needed for a per-run artifact.
export const OWNER_STATE = join(tmpdir(), "tracking-e2e-owner-state.json");
