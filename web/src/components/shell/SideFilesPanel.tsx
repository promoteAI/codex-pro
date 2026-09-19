import { useCallback, useEffect, useRef, useState } from "react";
import type { GitRepo } from "../../stores/chat";
import { useShellStore } from "../../stores/shell";
import { apiFetch } from "../../lib/api";

interface FileEntry {
  path: string;
  kind: "dir" | "file";
  icon?: string | null;
  ext?: string;
}

interface DirNode {
  entries: FileEntry[];
  loaded: boolean;
}

const ROOT = "";

function baseName(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

// ─── Icons (match prototype exactly) ────────────────────────────────────────

const CHEV = (
  <svg className="sf-chev" viewBox="0 0 24 24" aria-hidden="true">
    <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FILE_ICO = (
  <svg className="sf-fico" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M14 2v6h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const GIT_ICO = (
  <svg className="sf-fico is-git" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12.5 2.5 21.5 11.5a1.4 1.4 0 0 1 0 2l-8.5 8.5a1.4 1.4 0 0 1-2 0L2.5 13.5a1.4 1.4 0 0 1 0-2L11 2.5a1.4 1.4 0 0 1 1.5 0Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

// ─── Tree ─────────────────────────────────────────────────────────────────────

function TreeView({
  nodes,
  expanded,
  activePath,
  query,
  onLoad,
  onSelect,
}: {
  nodes: Record<string, DirNode>;
  expanded: Set<string>;
  activePath: string | null;
  query: string;
  onLoad: (path: string) => void;
  onSelect: (entry: FileEntry) => void;
}) {
  function matchQuery(name: string) {
    const q = query.trim().toLowerCase();
    return !q || name.toLowerCase().includes(q);
  }

  function renderNode(node: DirNode, _dirPath: string, depth: number): React.ReactNode {
    const pad = 8 + depth * 12;
    const items = query.trim()
      ? node.entries.filter((e) => matchQuery(baseName(e.path)))
      : node.entries;

    return items.map((entry) => {
      const isDir = entry.kind === "dir";
      const isExpanded = expanded.has(entry.path);
      const isActive = activePath === entry.path;
      const dim = SF_DIM[baseName(entry.path)] ? " is-dim" : "";

      return (
        <div key={entry.path}>
          <button
            type="button"
            className={`sf-item${dim} ${isActive ? "is-active" : ""} ${isExpanded ? "is-open" : ""}`}
            role="treeitem"
            aria-expanded={isDir ? isExpanded : undefined}
            style={{ paddingLeft: pad }}
            onClick={() => isDir ? onLoad(entry.path) : onSelect(entry)}
          >
            {isDir && CHEV}
            {!isDir && (entry.ext === "git" ? GIT_ICO : FILE_ICO)}
            <span className="sf-name">{baseName(entry.path)}</span>
            {isActive && <span className="sf-dot" aria-hidden="true" />}
          </button>
          {isDir && isExpanded && (
            <div className="sf-children" style={{ display: "block" }}>
              {renderChildren(entry.path, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  }

  function renderChildren(dirPath: string, depth: number): React.ReactNode {
    const node = nodes[dirPath];
    if (!node) return null;
    return renderNode(node, dirPath, depth);
  }

  return <>{renderChildren(ROOT, 0)}</>;
}

// Directories to dim (hidden) — matches prototype SF_DIM
const SF_DIM: Record<string, 1> = {
  ".venv": 1,
  "__pycache__": 1,
  ".pytest_cache": 1,
  ".ruff_cache": 1,
  ".git": 1,
  ".idea": 1,
  "node_modules": 1,
};

// ─── Panel ────────────────────────────────────────────────────────────────────

export function SideFilesPanel({ repo, onBack }: { repo: GitRepo; onBack: () => void }) {
  const openTool = useShellStore((s) => s.openTool);
  const [nodes, setNodes] = useState<Record<string, DirNode>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activePath, setActivePath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const loadingRef = useRef<Set<string>>(new Set());

  const loadDir = useCallback(
    async (dirPath: string) => {
      if (loadingRef.current.has(dirPath)) return;
      loadingRef.current.add(dirPath);
      try {
        const params = new URLSearchParams({ repo: repo.path });
        if (dirPath) params.set("path", dirPath);
        const res = await apiFetch<{ entries: FileEntry[] }>(`/files?${params.toString()}`);
        setNodes((prev) => ({ ...prev, [dirPath]: { entries: res.entries ?? [], loaded: true } }));
      } catch {
        setNodes((prev) => ({ ...prev, [dirPath]: { entries: [], loaded: true } }));
      } finally {
        loadingRef.current.delete(dirPath);
      }
    },
    [repo.path],
  );

  // Match prototype: click file → openFileTab (open in ToolsPanel)
  const handleFileClick = useCallback(
    (entry: FileEntry) => {
      setActivePath(entry.path);
      openTool("files", { filePath: { repoPath: repo.path, filePath: entry.path }, label: entry.path.split("/").pop() ?? entry.path });
    },
    [openTool, repo.path],
  );

  const toggleFolder = useCallback(
    (path: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      setNodes((prev) => {
        if (prev[path]) return prev;
        return { ...prev, [path]: { entries: [], loaded: false } };
      });
      void loadDir(path);
      setActivePath(path);
    },
    [loadDir],
  );

  useEffect(() => {
    setNodes({ [ROOT]: { entries: [], loaded: false } });
    void loadDir(ROOT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="side-files is-open" aria-label="项目文件">
      <button type="button" className="sf-back" onClick={onBack} aria-label="返回" title="返回">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 6 9 12l6 6" />
        </svg>
        返回
      </button>

      <div className="sf-search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m16.5 16.5 4 4" />
        </svg>
        <input
          type="search"
          value={query}
          placeholder="搜索文件..."
          aria-label="搜索文件"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="sf-proj">
        <span className="sf-proj-name">
          <span>{repo.name}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="7" cy="18" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="7" cy="6" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="17" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M7 8.2v7.6M9.2 6h3.3a4.5 4.5 0 0 1 4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </span>
        <div className="sf-proj-actions">
          <button
            type="button"
            className={`sf-icon-btn ${changedOnly ? "is-active" : ""}`}
            title="仅显示变更文件"
            aria-label="仅显示变更文件"
            aria-pressed={changedOnly}
            onClick={() => setChangedOnly((v) => !v)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3v6M12 15v6" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            type="button"
            className="sf-icon-btn"
            title="刷新"
            aria-label="刷新"
            onClick={() => loadDir(ROOT)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.3-5.7" />
              <path d="M20 4v5h-5" />
            </svg>
          </button>
        </div>
      </div>

      <div className="sf-tree" role="tree" aria-label="文件树">
        <TreeView
          nodes={nodes}
          expanded={expanded}
          activePath={activePath}
          query={query}
          onLoad={toggleFolder}
          onSelect={handleFileClick}
        />
      </div>
    </div>
  );
}
