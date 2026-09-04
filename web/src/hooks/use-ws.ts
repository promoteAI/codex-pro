import { useEffect, useMemo, useRef } from "react";
import { webWS } from "../lib/ws";
import { useAuthStore } from "../stores/auth";
import { useAuthRequired } from "../stores/capabilities";

type WsEvent = { type: string; payload: unknown };

/**
 * Subscribe to dashboard WS channels for the lifetime of the calling component.
 *
 * The handler is held in a ref so a fresh closure on every render (the normal
 * case) does not re-run the effect: only the token and the channel set do.
 * Cleanup releases this component's channel references, so the shared socket
 * closes once nothing is subscribed — previously the connection stayed open
 * (and a new one was created on the next mount).
 */
export function useWsSubscribe(
  channels: string[],
  handler: (ev: WsEvent) => void,
  eventTypes: string[],
) {
  const token = useAuthStore((s) => s.token);
  const authRequired = useAuthRequired();
  const logout = useAuthStore((s) => s.logout);

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  // Compare by content, not array identity: callers pass inline literals.
  const channelKey = channels.join(",");
  const typesKey = eventTypes.join(",");
  const channelList = useMemo(() => channelKey.split(",").filter(Boolean), [channelKey]);
  const typeList = useMemo(() => typesKey.split(",").filter(Boolean), [typesKey]);

  useEffect(() => {
    if ((authRequired !== false && !token) || channelList.length === 0) return;

    if (authRequired === false) webWS.openMode = true;

    // Register listeners first: with a warm socket, events can arrive on the
    // same tick as subscribe().
    const unsubs = typeList.map((type) =>
      webWS.on(type, (ev) => handlerRef.current(ev)),
    );
    const release = webWS.subscribe(token || "", channelList);

    // The token the socket authenticated with is no longer accepted; drop it
    // and route to login rather than letting the socket retry indefinitely.
    const onAuthFailure = () => {
      logout();
    };
    webWS.onAuthFailure = onAuthFailure;

    return () => {
      // Only clear the slot if it is still ours — a second subscriber may have
      // installed its own handler after us.
      if (webWS.onAuthFailure === onAuthFailure) webWS.onAuthFailure = null;
      unsubs.forEach((u) => u());
      release();
    };
  }, [token, authRequired, channelList, typeList, logout]);
}
