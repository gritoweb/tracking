export type ClientErrorKind = "boundary" | "route" | "unhandledrejection" | "api";

interface ReportClientErrorOptions {
  kind: ClientErrorKind;
  route?: string;
}

/** Fire-and-forget crash report to `POST /api/client-errors`; never throws, never loops. */
export function reportClientError(error: unknown, { kind, route }: ReportClientErrorOptions): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  void fetch("/api/client-errors", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 8000),
      route: route ?? window.location.pathname,
      kind,
    }),
  }).catch(() => {
    // intentional: reporting a reporting failure would recurse into this same path
  });
}

/** Wired once at startup, catching what no boundary sees. */
export function installUnhandledRejectionReporter(): void {
  window.addEventListener("unhandledrejection", (event) => {
    reportClientError(event.reason, { kind: "unhandledrejection" });
  });
}
