import { YServer } from "y-partyserver";
import type { Connection } from "partyserver";
import { DESCRIPTION_FIELD, SEED_DENIED, SEED_GRANTED, SEED_REQUEST } from "@shared/description-collab";

/** Yjs relay for live co-editing of one task description; D1 stays the source of truth (docs/ARCHITECTURE.md "Live description editing"). */
export class DescriptionRoom extends YServer<Cloudflare.Env> {
  // In memory while anyone is connected; the doc is dropped when the last editor leaves (see onClose).
  static options = { hibernate: false };

  private seeder: string | null = null;

  onCustomMessage(connection: Connection, message: string) {
    if (message !== SEED_REQUEST) return;
    // One seeder at a time: two editors opening an idle room together must not both insert the same content.
    const empty = this.document.getXmlFragment(DESCRIPTION_FIELD).length === 0;
    const granted = empty && (this.seeder === null || this.seeder === connection.id);
    if (granted) this.seeder = connection.id;
    this.sendCustomMessage(connection, granted ? SEED_GRANTED : SEED_DENIED);
  }

  onClose(connection: Connection, code: number, reason: string, wasClean: boolean) {
    super.onClose(connection, code, reason, wasClean);
    if (this.seeder === connection.id) this.seeder = null;
    // Reset, not clear: a stale doc would beat a newer D1 save, and a clear's deletes would wipe a reconnecting editor.
    const others = [...this.getConnections()].some((c) => c.id !== connection.id && c.readyState === WebSocket.OPEN);
    if (!others) this.ctx.abort("last editor left");
  }
}
