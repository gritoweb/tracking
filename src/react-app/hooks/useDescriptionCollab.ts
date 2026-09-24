import { useEffect, useMemo } from "react";
import * as Y from "yjs";
import YProvider from "y-partyserver/provider";
import { spreadColor } from "@shared/colors";

export interface DescriptionCollab {
  doc: Y.Doc;
  provider: YProvider;
  user: { name: string; color: string };
}

/** Same person, same caret colour, on every screen and every session. */
function colorFor(userId: string) {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return spreadColor(Math.abs(hash));
}

/** The live room for one task's description, or null while it's off. */
export function useDescriptionCollab(
  taskId: string,
  enabled: boolean,
  person: { id: string; name: string } | null
): DescriptionCollab | null {
  const personId = person?.id;
  const personName = person?.name;

  // Built disconnected, so rendering stays free of side effects; the effect below owns the socket.
  const collab = useMemo(() => {
    if (!enabled || !personId) return null;
    const doc = new Y.Doc();
    // The worker authenticates the upgrade by session cookie and scopes the room to the caller's workspace.
    const provider = new YProvider(window.location.host, taskId, doc, {
      connect: false,
      prefix: `/api/collab/descriptions/${taskId}`,
      protocol: window.location.protocol === "https:" ? "wss" : "ws",
    });
    return { doc, provider, user: { name: personName ?? "Someone", color: colorFor(personId) } };
  }, [enabled, taskId, personId, personName]);

  useEffect(() => {
    if (!collab) return;
    void collab.provider.connect();
    return () => collab.provider.disconnect();
  }, [collab]);

  return collab;
}
