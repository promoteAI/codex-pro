import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Plus } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { useShellStore } from "../../stores/shell";
import { TermSession } from "../../lib/term";

interface TermTab {
  id: string;
  label: string;
  term: { write(data: string | Uint8Array): void; open(el: HTMLElement): void; element: HTMLElement | null; cols: number; rows: number; onData(cb: (d: string) => void): void; onResize(cb: (s: { cols: number; rows: number }) => void): void };
  session: TermSession;
  fit: { fit(): void };
}

let termSeq = 1;

/**
 * xterm is loaded lazily so a closed panel (the default) never imports it.
 * jsdom cannot back a canvas, and importing @xterm/xterm already constructs a
 * renderer row factory that touches one; loading it only on open keeps the
 * Layout tests (which render TermPanel with the panel closed) green.
 */
async function createTerminal(label: string): Promise<TermTab> {
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import("@xterm/xterm"),
    import("@xterm/addon-fit"),
  ]);

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 12.5,
    fontFamily: '"Cascadia Mono", "JetBrains Mono", Menlo, Consolas, monospace',
    theme: { background: "#121212", foreground: "#c8c8c8" },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);

  const session = new TermSession();
  session.onData = (chunk) => term.write(chunk);
  session.onExit = (code) => {
    term.write(`\r\n\x1b[90m[${code === -1 ? "disconnected" : `exited ${code}`}]\x1b[0m\r\n`);
  };
  term.onData((data) => session.write(data));
  term.onResize(({ cols, rows }) => session.resize(cols, rows));

  return { id: `t${termSeq++}`, label, term, session, fit };
}

export function TermPanel() {
  const { t } = useTranslation("tools");
  const termOpen = useShellStore((s) => s.termOpen);
  const closeTerm = useShellStore((s) => s.closeTerm);

  // Terminals are created lazily so a closed panel never touches xterm. Tabs
  // are cleared on close so the shell is reaped and a fresh one spins up the
  // next time the panel opens.
  const [tabs, setTabs] = useState<TermTab[]>([]);
  const [activeId, setActiveId] = useState("");
  const containers = useRef(new Map<string, HTMLDivElement>());

  // Ensure at least one tab the moment the panel opens.
  useEffect(() => {
    if (!termOpen || tabs.length > 0) return;
    let cancelled = false;
    createTerminal(`${t("terminal")} 1`).then((tab) => {
      if (cancelled) return;
      setTabs([tab]);
      setActiveId(tab.id);
    });
    return () => {
      cancelled = true;
    };
  }, [termOpen, tabs.length, t]);

  // Open + fit the active terminal once its container is in the DOM.
  useEffect(() => {
    if (!termOpen) return;
    const active = tabs.find((x) => x.id === activeId);
    const el = containers.current.get(activeId);
    if (!active || !el) return;
    if (!active.term.element) active.term.open(el);
    active.fit.fit();
    active.session.connect("", "", active.term.cols, active.term.rows);
  }, [activeId, termOpen, tabs]);

  // Refit on window resize and push the new size to the backend.
  useEffect(() => {
    if (!termOpen) return;
    const active = tabs.find((x) => x.id === activeId);
    if (!active) return;
    const onResize = () => {
      active.fit.fit();
      active.session.resize(active.term.cols, active.term.rows);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeId, termOpen, tabs]);

  // Dispose every session when the panel closes so the shell is reaped. Guard
  // the clear: setting an already-empty array to a fresh reference would retrigger
  // this effect forever.
  useEffect(() => {
    if (!termOpen) {
      tabs.forEach((tab) => tab.session.dispose());
      if (tabs.length > 0) setTabs([]);
    }
  }, [termOpen, tabs]);

  const addTab = async () => {
    const tab = await createTerminal(`${t("terminal")} ${termSeq}`);
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const target = prev.find((x) => x.id === id);
      target?.session.dispose();
      const next = prev.filter((x) => x.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? "");
      return next;
    });
  };

  const registerContainer = (id: string, el: HTMLDivElement | null) => {
    if (el) containers.current.set(id, el);
    else containers.current.delete(id);
  };

  return (
    <div
      className={`shrink-0 overflow-hidden border-t border-codex-border bg-codex-panel transition-[height] duration-200 ${
        termOpen ? "h-[min(280px,36vh)]" : "h-0 border-t-0"
      }`}
      aria-hidden={!termOpen}
    >
      <div className="h-full flex flex-col min-h-0">
        <div className="flex items-center gap-1 px-2 py-1 border-b border-codex-border overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveId(tab.id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] shrink-0 ${
                activeId === tab.id
                  ? "bg-[#2e2e2e] text-[#f0f0f0]"
                  : "text-[#9a9a9a] hover:bg-[#252525]"
              }`}
            >
              <span>{tab.label}</span>
              {tabs.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  className="opacity-60 hover:opacity-100"
                  aria-label={t("close")}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }
                  }}
                >
                  <X size={11} />
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={addTab}
            className="text-codex-muted hover:text-codex-text p-0.5 shrink-0"
            aria-label={t("termAddTab")}
            title={t("termNewTab")}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={closeTerm}
            className="ml-auto text-codex-muted hover:text-codex-text p-0.5 shrink-0"
            aria-label={t("close")}
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 min-h-0 bg-[#121212]">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              ref={(el) => registerContainer(tab.id, el)}
              className={`h-full ${activeId === tab.id ? "block" : "hidden"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
