import { DurableObject } from "cloudflare:workers";

/** One instance per user — delivers their own notifications live, wherever they're connected. */
export class NotificationRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/ws")) {
      const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/notify" && request.method === "POST") {
      const body = await request.text();
      let sent = 0;
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(body);
          sent++;
        } catch {
          // Dead socket — the runtime reaps it; nothing to clean up here.
        }
      }
      return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response("Not found", { status: 404 });
  }

  // Server-to-client only — any inbound frame beyond the ping pair is a broken client.
  webSocketMessage(): void {}

  webSocketError(ws: WebSocket): void {
    try {
      ws.close(1011, "error");
    } catch {
      // socket already closed
    }
  }
}
