import { useEffect, useRef, useState } from "react";
import { toast } from "../stores/toast";

type McpView = "form" | "json";
type McpType = "stdio" | "sse" | "http";

const SCOPES = ["用户", "codex-pro", "default"] as const;

interface McpCreateViewProps {
  onCancel: () => void;
  onSaved: (name: string) => void;
}

function ScopeIcon({ kind }: { kind: "user" | "workspace" }) {
  if (kind === "workspace") {
    return (
      <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
        <path d="M3 7l2.5-3h5L13 7" />
      </svg>
    );
  }
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

function parseEnv(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
      );
    }
  } catch {
    /* fall through to KEY=VALUE lines */
  }
  const env: Record<string, string> = {};
  for (const line of trimmed.split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return env;
}

/** Prototype mcpCreateView — create an MCP server from form or JSON. */
export function McpCreateView({ onCancel, onSaved }: McpCreateViewProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const scopeMenuRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<McpView>("form");
  const [scope, setScope] = useState<string>("用户");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [envOpen, setEnvOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<McpType>("stdio");
  const [timeoutMs, setTimeoutMs] = useState("");
  const [protocol, setProtocol] = useState("auto");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [envText, setEnvText] = useState("");
  const [jsonText, setJsonText] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!scopeOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (scopeMenuRef.current?.contains(e.target as Node)) return;
      setScopeOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [scopeOpen]);

  const buildEntry = () => {
    const argList = args.trim() ? args.trim().split(/\s+/).filter(Boolean) : [];
    const env = parseEnv(envText);
    const entry: Record<string, unknown> = {
      type,
      command: command.trim(),
      args: argList,
    };
    if (timeoutMs.trim()) entry.timeout_ms = Number(timeoutMs.trim()) || 30000;
    if (protocol && protocol !== "auto") entry.protocol = protocol;
    if (Object.keys(env).length) entry.env = env;
    return entry;
  };

  const syncJsonFromForm = () => {
    const n = name.trim() || "my-mcp-server";
    setJsonText(JSON.stringify({ [n]: buildEntry() }, null, 2));
  };

  const switchView = (next: McpView) => {
    if (next === "json") syncJsonFromForm();
    setView(next);
    setScopeOpen(false);
  };

  const scopeControl = (
    <div className="mcp-scope-wrap" ref={scopeMenuRef}>
      <div className="mcp-field-label">作用域</div>
      <button
        type="button"
        className="mcp-scope-btn"
        aria-haspopup="listbox"
        aria-expanded={scopeOpen}
        onClick={() => setScopeOpen((o) => !o)}
      >
        <ScopeIcon kind={scope === "用户" ? "user" : "workspace"} />
        <span>{scope}</span>
        <span className="dropdown-arrow" />
      </button>
      <div
        className={`mcp-scope-menu${scopeOpen ? " open" : ""}`}
        role="listbox"
        aria-label="作用域"
        hidden={!scopeOpen}
      >
        <button
          type="button"
          className={`mcp-scope-item${scope === "用户" ? " is-active" : ""}`}
          role="option"
          aria-selected={scope === "用户"}
          onClick={() => {
            setScope("用户");
            setScopeOpen(false);
          }}
        >
          <ScopeIcon kind="user" />
          用户
          <svg className="gn-dd-check" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 12 5 5 9-10" />
          </svg>
        </button>
        <div className="mcp-scope-sep" role="separator" />
        <div className="mcp-scope-group">工作区</div>
        {SCOPES.filter((s) => s !== "用户").map((s) => (
          <button
            key={s}
            type="button"
            className={`mcp-scope-item${scope === s ? " is-active" : ""}`}
            role="option"
            aria-selected={scope === s}
            onClick={() => {
              setScope(s);
              setScopeOpen(false);
            }}
          >
            <ScopeIcon kind="workspace" />
            {s}
            <svg className="gn-dd-check" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 12 5 5 9-10" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );

  const save = () => {
    let savedName = "";
    if (view === "json") {
      try {
        let parsed = JSON.parse(jsonText || "{}") as Record<string, unknown>;
        if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
          parsed = parsed.mcpServers as Record<string, unknown>;
        }
        const keys = Object.keys(parsed || {});
        savedName = keys[0] || "";
      } catch {
        toast.info("JSON 格式无效");
        return;
      }
    } else {
      savedName = name.trim();
    }
    if (!savedName) {
      nameRef.current?.focus();
      toast.info("请填写名称");
      return;
    }
    onSaved(savedName);
    toast.success(`已添加 MCP：${savedName}`);
  };

  return (
    <div className="mcp-create is-active" aria-label="新建 MCP 服务器">
      <div className="mcp-create-head">
        <div>
          <h2 className="mcp-create-title">新建 MCP 服务器</h2>
          <p className="mcp-create-sub">填写新的 MCP 配置，保存后返回列表。</p>
        </div>
        <div className="mcp-view-seg" role="group" aria-label="编辑视图">
          <button
            type="button"
            className={view === "form" ? "is-active" : ""}
            onClick={() => switchView("form")}
          >
            表单
          </button>
          <button
            type="button"
            className={view === "json" ? "is-active" : ""}
            onClick={() => switchView("json")}
          >
            JSON
          </button>
        </div>
      </div>

      <div className={`mcp-form-pane${view === "json" ? " is-hidden" : ""}`}>
        <div className="mcp-create-card">
          <div className="mcp-create-row">
            <div className="mcp-field grow">
              <label className="mcp-field-label" htmlFor="mcpName">
                名称
              </label>
              <input
                ref={nameRef}
                className="mcp-input"
                id="mcpName"
                type="text"
                placeholder="my-mcp-server"
                spellCheck={false}
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {view === "form" && scopeControl}
          </div>

          <div className="mcp-create-row cols-3">
            <div className="mcp-field">
              <label className="mcp-field-label" htmlFor="mcpType">
                类型
              </label>
              <select
                className="mcp-select"
                id="mcpType"
                value={type}
                onChange={(e) => setType(e.target.value as McpType)}
              >
                <option value="stdio">stdio (本地命令)</option>
                <option value="sse">sse (Server-Sent Events)</option>
                <option value="http">streamable http</option>
              </select>
            </div>
            <div className="mcp-field">
              <label className="mcp-field-label" htmlFor="mcpTimeout">
                超时时间 MS
              </label>
              <input
                className="mcp-input"
                id="mcpTimeout"
                type="text"
                placeholder="30000"
                inputMode="numeric"
                spellCheck={false}
                autoComplete="off"
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(e.target.value)}
              />
            </div>
            <div className="mcp-field">
              <label className="mcp-field-label" htmlFor="mcpProtocol">
                协议版本
              </label>
              <select
                className="mcp-select"
                id="mcpProtocol"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
              >
                <option value="auto">自动 (推荐)</option>
                <option value="2024-11-05">2024-11-05</option>
                <option value="2025-03-26">2025-03-26</option>
              </select>
            </div>
          </div>

          <div className="mcp-create-row">
            <div className="mcp-field grow">
              <label className="mcp-field-label" htmlFor="mcpCommand">
                命令
              </label>
              <input
                className="mcp-input"
                id="mcpCommand"
                type="text"
                placeholder="npx"
                spellCheck={false}
                autoComplete="off"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
            </div>
          </div>

          <div className="mcp-create-row">
            <div className="mcp-field grow">
              <label className="mcp-field-label" htmlFor="mcpArgs">
                参数 (空格分隔)
              </label>
              <input
                className="mcp-input"
                id="mcpArgs"
                type="text"
                placeholder="-y @modelcontextprotocol/server-memory"
                spellCheck={false}
                autoComplete="off"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            className={`mcp-env-toggle${envOpen ? " is-open" : ""}`}
            aria-expanded={envOpen}
            onClick={() => setEnvOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
            环境变量 (可选)
          </button>
          <div className={`mcp-env-body${envOpen ? " is-open" : ""}`} hidden={!envOpen}>
            <textarea
              className="mcp-textarea"
              id="mcpEnv"
              placeholder={'{\n  "MY_API_KEY": "your-key"\n}'}
              spellCheck={false}
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className={`mcp-json-pane${view === "json" ? " is-active" : ""}`}>
        <div className="mcp-json-toolbar">{view === "json" && scopeControl}</div>
        <div className="mcp-json-card">
          <div className="mcp-json-card-title">完整配置</div>
          <textarea
            className="mcp-json-editor"
            spellCheck={false}
            aria-label="完整配置"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
          <p className="mcp-json-hint">
            支持直接粘贴 <code>{'{"server-name": {...}}'}</code> 或{" "}
            <code>{'{"mcpServers": {"server-name": {...}}}'}</code>。
          </p>
        </div>
      </div>

      <div className="mcp-create-foot">
        <button type="button" className="mcp-save-btn" onClick={save}>
          保存
        </button>
        <button type="button" className="mcp-cancel-btn" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
