/** Live co-editing of task descriptions: off unless the deploy opts in, so no socket opens and saving is unchanged. */
export function collabDescriptionsEnabled(env: Env) {
  // Unset in production's wrangler vars: reads as undefined there, not as the typegen's `string`.
  return env.COLLAB_DESCRIPTIONS === "true";
}
