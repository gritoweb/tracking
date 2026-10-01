// A tab from before a deploy asks for chunks it removed; Vite fires this for every failed dynamic import.
const RELOADED_AT = "stale-chunk-reload-at";
// A second failure this soon after reloading is a real outage, not a stale tab: let it surface.
const RETRY_WINDOW_MS = 10_000;

let reloading = false;
/** True once a reload is under way: the error the failed import still throws is about to be gone. */
export const isReloadingForStaleChunk = () => reloading;

export function installStaleChunkReload(win: Window = window) {
  win.addEventListener("vite:preloadError", (event) => {
    const last = Number(win.sessionStorage.getItem(RELOADED_AT) ?? 0);
    if (Date.now() - last < RETRY_WINDOW_MS) return;
    win.sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    reloading = true;
    event.preventDefault();
    win.location.reload();
  });
}
