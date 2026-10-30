import { create } from "zustand";

/** One dashboard notification, derived from a WS broadcast.
 *  `type` is the raw event type so the panel can translate the title at
 *  render time (the store must stay i18n-agnostic — language can switch
 *  while old notifications are still listed). */
export interface NotificationItem {
  id: number;
  type: string;
  /** Subject line: task title, channel name, memory tier… */
  label: string;
  at: number;
}

interface NotificationsState {
  items: NotificationItem[];
  /** Feed one WS event in. Unknown types are ignored so a new backend event
   *  does not render a raw English string in a localized panel. */
  pushFromEvent: (type: string, payload: unknown) => void;
  clear: () => void;
}

/** Keep the panel bounded: it is a "what happened while you were away" list,
 *  not an audit log. Oldest entries fall off the end. */
const MAX_ITEMS = 20;

/** WS event types that become notifications, mapped to the payload field the
 *  subject line is read from. Anything else arriving on the subscribed
 *  channels is deliberately dropped. */
const EVENT_LABEL_FIELD: Record<string, string> = {
  task_created: "title",
  task_transitioned: "title",
  task_updated: "title",
  channel_updated: "name",
  memory_changed: "tier",
};

let seq = 0;

export const useNotificationsStore = create<NotificationsState>((set) => ({
  items: [],

  pushFromEvent: (type, payload) => {
    const field = EVENT_LABEL_FIELD[type];
    if (!field) return;
    const obj = (payload ?? {}) as Record<string, unknown>;
    const raw = obj[field];
    const label = typeof raw === "string" && raw.trim() ? raw.trim() : "";
    const item: NotificationItem = {
      id: ++seq,
      type,
      label,
      at: Date.now(),
    };
    set((s) => ({ items: [item, ...s.items].slice(0, MAX_ITEMS) }));
  },

  clear: () => set({ items: [] }),
}));
