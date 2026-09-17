import { chromium, type FullConfig } from "@playwright/test";
import { signUp } from "./auth";
import { OWNER_STATE } from "./auth-state";

// One owner + workspace for the whole run, reused by specs that don't need workspace isolation.
export default async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await signUp(page);
  await page.context().storageState({ path: OWNER_STATE });
  await browser.close();
}
