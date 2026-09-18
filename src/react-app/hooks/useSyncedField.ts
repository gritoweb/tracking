import { useEffect, useRef, useState } from "react";

/**
 * A field that is edited locally but lives on the server: it follows the server's value (someone else
 * renamed the task) unless the person has typed something of their own, and starts over when `resetKey` changes.
 */
export function useSyncedField(server: string, resetKey: string | null) {
  const [value, setValue] = useState(server);
  const last = useRef({ resetKey, server });

  useEffect(() => {
    const previous = last.current;
    last.current = { resetKey, server };
    if (previous.resetKey !== resetKey) setValue(server);
    else if (previous.server !== server) setValue((local) => (local === previous.server ? server : local));
  }, [resetKey, server]);

  return [value, setValue] as const;
}
