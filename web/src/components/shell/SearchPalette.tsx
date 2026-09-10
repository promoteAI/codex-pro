import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Search, X } from "lucide-react";
import { useShellStore } from "../../stores/shell";
import { useApi } from "../../hooks/use-api";

interface PrItem {
  id: string;
  title: string;
  meta: string;
  status: string;
}

interface FileItem {
  path: string;
  kind: "file" | "dir";
}

export function SearchPalette() {
  const open = useShellStore((s) => s.searchOpen);
  const closeSearch = useShellStore((s) => s.closeSearch);
  const openSettings = useShellStore((s) => s.openSettings);
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  // Fetch live PRs and files for search
  const { data: prData } = useApi<{ prs: PrItem[] }>("/prs");
  const { data: fileData } = useApi<{ entries: FileItem[]; path: string }>("/files");

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useShellStore.getState().openSearch();
      }
      if (e.key === "Escape" && useShellStore.getState().searchOpen) {
        closeSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSearch]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const items: Array<{ id: string; label: string; hint: string; run: () => void }> = [
      {
        id: "nav-home",
        label: "New chat",
        hint: "/",
        run: () => navigate("/"),
      },
      {
        id: "nav-prs",
        label: "Pull Requests",
        hint: "/prs",
        run: () => navigate("/prs"),
      },
      {
        id: "nav-sch",
        label: "Scheduled",
        hint: "/scheduled",
        run: () => navigate("/scheduled"),
      },
      {
        id: "nav-pl",
        label: "Plugins",
        hint: "/plugins",
        run: () => navigate("/plugins"),
      },
      {
        id: "set",
        label: "Settings",
        hint: "settings",
        run: () => openSettings(),
      },
      ...((prData?.prs ?? []).map((p: PrItem) => ({
        id: `pr-${p.id}`,
        label: p.title,
        hint: "PR",
        run: () => navigate("/prs"),
      }))),
      ...((fileData?.entries ?? []).map((f: FileItem) => ({
        id: `f-${f.path}`,
        label: f.path,
        hint: f.kind,
        run: () => useShellStore.getState().openTool("files"),
      }))),
    ];
    if (!query) return items.slice(0, 8);
    return items.filter(
      (i) => i.label.toLowerCase().includes(query) || i.hint.toLowerCase().includes(query),
    );
  }, [q, navigate, openSettings, prData, fileData]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex justify-center pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      onClick={closeSearch}
    >
      <div
        className="w-[min(560px,92vw)] bg-codex-elevated border border-codex-border-strong rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-codex-border">
          <Search size={16} className="text-codex-muted shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search commands, PRs, files..."
            className="flex-1 bg-transparent outline-none text-sm text-codex-text placeholder:text-codex-muted"
          />
          <button type="button" onClick={closeSearch} aria-label="Close" className="text-codex-muted hover:text-codex-text">
            <X size={16} />
          </button>
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-codex-muted text-sm">No results found</li>
          )}
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-codex-hover"
                onClick={() => {
                  r.run();
                  closeSearch();
                }}
              >
                <span className="text-sm text-codex-text truncate">{r.label}</span>
                <span className="text-[11px] text-codex-muted ml-3 shrink-0">{r.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}