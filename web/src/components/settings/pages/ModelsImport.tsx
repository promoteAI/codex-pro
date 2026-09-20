import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Eye, EyeOff, Trash2, Pencil, Loader2, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActionBtn, PageSub, PageTitle, SettingsCard, SettingsRow, Toggle } from "../ui";
import { useProvidersStore, type ProviderEntry } from "../../../stores/providers";
import { toast } from "../../../stores/toast";
import { AddModelModal } from "./AddModelModal";
import { useWsSubscribe } from "../../../hooks/use-ws";

export function ModelsPage() {
  const { t } = useTranslation("settings");
  const {
    providers,
    activeName,
    loading,
    error,
    testingName,
    testResult,
    fetchProviders,
    setActive,
    deleteProvider,
    updateProvider,
    renameProvider,
    testProvider,
    refreshHealth,
    removeModel,
  } = useProvidersStore();

  const [active, setActiveLocal] = useState<ProviderEntry | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddModelModal, setShowAddModelModal] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [editValues, setEditValues] = useState({ baseUrl: "", apiKey: "", format: "openai" as "openai" | "anthropic" | "responses" });
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    fetchProviders();
    refreshHealth();
    const interval = setInterval(refreshHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  useWsSubscribe(
    ["models"],
    () => { fetchProviders(); refreshHealth(); },
    ["config_updated"],
  );

  useEffect(() => {
    if (providers.length > 0 && (!activeName || !providers.find((p) => p.name === activeName))) {
      setActive(providers[0].name);
    }
  }, [providers, activeName]);

  useEffect(() => {
    const found = providers.find((p) => p.name === activeName);
    if (found) {
      setActiveLocal(found);
      setEditValues({ baseUrl: found.api_base, apiKey: found.api_key, format: "openai" });
    }
  }, [providers, activeName]);

  const groups = useMemo(() => {
    const map = new Map<string, ProviderEntry[]>();
    for (const p of providers) {
      const group = inferGroup(p.api_base);
      const list = map.get(group) ?? [];
      list.push(p);
      map.set(group, list);
    }
    // Fixed order: 智谱 first, then known brands, then custom
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const g of ["智谱", "OpenAI", "Anthropic", "DeepSeek", "阿里通义", "月之暗面", "自定义供应商"]) {
      if (map.has(g)) { ordered.push(g); seen.add(g); }
    }
    for (const g of map.keys()) {
      if (!seen.has(g)) ordered.push(g);
    }
    return ordered.map((g) => [g, map.get(g)!] as [string, ProviderEntry[]]);
  }, [providers]);

  const handleDelete = async (name: string) => {
    if (!confirm(t("deleteProviderConfirm", { name }))) return;
    try {
      await deleteProvider(name);
    } catch { /* error shown by toast */ }
  };

  const handleTest = async (name: string) => {
    await testProvider(name);
  };

  const handleStartRename = () => {
    setRenameInput(active?.name ?? "");
    setIsRenaming(true);
  };

  const handleRenameSubmit = async () => {
    const newName = renameInput.trim();
    if (!newName || !active) return;
    if (newName === active.name) { setIsRenaming(false); return; }
    try {
      await renameProvider(active.name, newName);
      setIsRenaming(false);
    } catch { /* error shown by toast */ }
  };

  const handleRenameCancel = () => {
    setRenameInput(active?.name ?? "");
    setIsRenaming(false);
  };

  const handleFieldBlur = (field: string) => {
    if (!active) return;
    clearTimeout(debounceRef.current[field]);
    debounceRef.current[field] = setTimeout(async () => {
      const values = { ...editValues };
      try {
        const patch: Record<string, unknown> = {};
        if (field === "baseUrl") patch.api_base = values.baseUrl;
        else if (field === "apiKey") patch.api_key = values.apiKey;
        else if (field === "format") patch.api_base = resolveApiBase(values.format, values.baseUrl);
        await updateProvider(active.name, patch);
      } catch { /* error shown by toast */ }
    }, 500);
  };

  const handleFieldKeyDown = (e: React.KeyboardEvent, field: string) => {
    if (e.key === "Enter") {
      handleFieldBlur(field);
    } else if (e.key === "Escape") {
      if (active) {
        setEditValues({ baseUrl: active.api_base, apiKey: active.api_key, format: "openai" });
      }
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    if (!active) return;
    try {
      await removeModel(active.name, modelId);
    } catch { /* error shown by toast */ }
  };

  const healthColor = (status?: string) => {
    switch (status) {
      case "healthy": return "bg-codex-success";
      case "degraded": return "bg-yellow-500";
      case "cooldown": return "bg-orange-500";
      case "disabled": return "bg-[#444]";
      default: return "bg-[#555]";
    }
  };

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <PageTitle>{t("modelsTitle")}</PageTitle>
        <div className="mt-4 p-3 rounded-lg bg-codex-danger/10 text-codex-danger text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 max-w-[960px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4 shrink-0">
        <div>
          <PageTitle>{t("modelsTitle")}</PageTitle>
          <PageSub>{t("modelsDesc")}</PageSub>
        </div>
        <button
          type="button"
          onClick={() => { fetchProviders(); refreshHealth(); }}
          className="w-8 h-8 rounded-lg border border-codex-border bg-codex-surface text-codex-muted grid place-items-center hover:bg-codex-surface-raised hover:text-codex-text"
          aria-label={t("refresh")}
          title={t("refresh")}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {loading && providers.length === 0 ? (
        <div className="flex-1 grid place-items-center text-codex-muted text-sm">
          <Loader2 size={20} className="animate-spin mr-2" />
          {t("loading")}
        </div>
      ) : (
        <div className="flex flex-1 min-h-[420px] bg-codex-surface border border-codex-border rounded-xl overflow-hidden">
          {/* Sidebar */}
          <aside className="w-[200px] shrink-0 border-r border-codex-border bg-codex-bg flex flex-col">
            <div className="flex-1 overflow-y-auto px-2 py-3">
              {groups.map(([group, list]) => (
                <div key={group} className="mb-3.5">
                  <div className="text-[11.5px] text-codex-muted font-medium px-2 pb-1.5">{group}</div>
                  {list.map((p) => {
                    const h = p.health;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => setActive(p.name)}
                        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] text-left mb-0.5 border ${
                          activeName === p.name
                            ? "bg-codex-surface border-codex-border-separator text-codex-text"
                            : "border-transparent text-codex-muted hover:bg-codex-surface"
                        }`}
                      >
                        <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${healthColor(h?.status)}`} />
                        <span className="flex-1 truncate">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {providers.length === 0 && (
                <div className="text-[12px] text-codex-muted px-2 py-4 text-center">
                  {t("noProviders")}
                </div>
              )}
            </div>
            <div className="px-2 pb-3">
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="w-full py-2 rounded-lg border border-dashed border-codex-border-input text-[12.5px] text-codex-muted hover:bg-codex-surface hover:text-codex-text transition-colors"
              >
                + {t("addProvider")}
              </button>
            </div>
          </aside>

          {/* Detail panel */}
          <div className="flex-1 min-w-0 overflow-y-auto p-5">
            {active ? (
              <>
                {/* Header row */}
                <div className="flex items-center gap-2 mb-4">
                  {isRenaming ? (
                    <input
                      className="bg-codex-bg border border-codex-accent rounded px-2 py-1 text-[15px] font-semibold text-codex-text outline-none w-[160px]"
                      value={renameInput}
                      onChange={(e) => setRenameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSubmit();
                        else if (e.key === "Escape") handleRenameCancel();
                      }}
                      autoFocus
                      onBlur={handleRenameSubmit}
                    />
                  ) : (
                    <>
                      <div className="text-[16px] font-semibold text-codex-text flex-1">{active.name}</div>
                      <button
                        type="button"
                        onClick={handleStartRename}
                        className="w-7 h-7 rounded-md grid place-items-center text-codex-muted hover:bg-codex-surface-raised hover:text-codex-text"
                        title={t("renameProvider")}
                        aria-label={t("renameProvider")}
                      >
                        <Pencil size={13} />
                      </button>
                    </>
                  )}

                  {/* Enable/disable toggle */}
                  <div className="inline-flex rounded-md border border-codex-border-input overflow-hidden text-[12px]" role="group" aria-label={t("enabled")}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (active.disabled) {
                          await updateProvider(active.name, { disabled: false });
                        }
                      }}
                      className={`px-2.5 py-1 ${
                        !active.disabled
                          ? "bg-codex-success/20 text-codex-success"
                          : "text-codex-muted hover:bg-codex-surface-raised"
                      }`}
                    >
                      {t("enabled")}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!active.disabled) {
                          await updateProvider(active.name, { disabled: true });
                        }
                      }}
                      className={`px-2.5 py-1 border-l border-codex-border-input ${
                        active.disabled
                          ? "bg-codex-danger/20 text-codex-danger"
                          : "text-codex-muted hover:bg-codex-surface-raised"
                      }`}
                    >
                      {t("disabled")}
                    </button>
                  </div>

                  {/* Test connection */}
                  <button
                    type="button"
                    onClick={() => handleTest(active.name)}
                    disabled={testingName === active.name}
                    className="w-7 h-7 rounded-md grid place-items-center text-codex-muted hover:bg-codex-surface-raised hover:text-codex-text"
                    title={t("testConnection")}
                    aria-label={t("testConnection")}
                  >
                    {testingName === active.name ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <RefreshCw size={13} />
                    )}
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => handleDelete(active.name)}
                    className="w-7 h-7 rounded-md grid place-items-center text-codex-muted hover:bg-codex-surface-raised hover:text-codex-danger"
                    title={t("delete")}
                    aria-label={t("delete")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Test result */}
                {testResult && (
                  <div
                    className={`mb-3 text-[12px] px-3 py-2 rounded-lg ${
                      testResult.ok
                        ? "bg-codex-success/10 text-codex-success"
                        : "bg-codex-danger/10 text-codex-danger"
                    }`}
                  >
                    {testResult.ok ? t("testSuccess") : `${t("testFail")}: ${testResult.error}`}
                  </div>
                )}

                {/* Editable fields */}
                <Field label="Base URL">
                  <input
                    className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 text-[13px] text-codex-text outline-none focus:border-codex-accent"
                    value={editValues.baseUrl}
                    onChange={(e) => setEditValues((v) => ({ ...v, baseUrl: e.target.value }))}
                    onBlur={() => handleFieldBlur("baseUrl")}
                    onKeyDown={(e) => handleFieldKeyDown(e, "baseUrl")}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </Field>

                <Field label={t("apiFormat")}>
                  <select
                    className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 text-[13px] text-codex-text outline-none focus:border-codex-accent"
                    value={editValues.format}
                    onChange={(e) => setEditValues((v) => ({ ...v, format: e.target.value as "openai" | "anthropic" | "responses" }))}
                    onBlur={() => handleFieldBlur("format")}
                  >
                    <option value="openai">{t("formatChatCompletions")}</option>
                    <option value="responses">{t("formatResponses")}</option>
                    <option value="anthropic">{t("formatAnthropic")}</option>
                  </select>
                </Field>

                <Field label={t("apiKey")}>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 pr-10 text-[13px] text-codex-text outline-none focus:border-codex-accent"
                      value={editValues.apiKey}
                      onChange={(e) => setEditValues((v) => ({ ...v, apiKey: e.target.value }))}
                      onBlur={() => handleFieldBlur("apiKey")}
                      onKeyDown={(e) => handleFieldKeyDown(e, "apiKey")}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-codex-muted hover:text-codex-text"
                      aria-label={t("toggleKey")}
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </Field>

                {/* Model list */}
                <div className="text-[13px] font-medium text-codex-muted mt-5 mb-2">{t("modelList")}</div>
                <div className="space-y-1.5">
                  {active.models.length > 0 ? active.models.map((m) => (
                    <ModelItem
                      key={m}
                      modelId={m}
                      onDelete={() => handleDeleteModel(m)}
                      t={t}
                    />
                  )) : (
                    <div className="text-[12px] text-codex-muted py-2">{t("noModels")}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModelModal(true)}
                  className="mt-3 w-full py-2 rounded-lg border border-dashed border-codex-border-input text-[12.5px] text-codex-muted hover:bg-codex-surface hover:text-codex-text transition-colors"
                >
                  + {t("addModel")}
                </button>
              </>
            ) : (
              <div className="flex-1 grid place-items-center text-codex-muted text-sm">
                {t("selectProvider")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add provider modal */}
      {showAddModal && (
        <AddProviderModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => setShowAddModal(false)}
        />
      )}

      {/* Add model modal */}
      <AddModelModal
        open={showAddModelModal}
        onClose={() => setShowAddModelModal(false)}
        providerName={active?.name ?? ""}
      />
    </div>
  );
}

function ModelItem({ modelId, onDelete, t }: { modelId: string; onDelete: () => void; t: (k: string) => string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-codex-bg border border-codex-border-input">
      <div className="flex-1 min-w-0 text-[13px] text-codex-text font-medium truncate">{modelId}</div>
      <div className="flex gap-1.5">
        <span className="text-[11px] text-codex-muted bg-codex-surface border border-codex-border-input rounded px-1.5 py-0.5">
          {t("vision")}
        </span>
      </div>
      <div className="flex gap-0.5 text-codex-muted">
        <button
          type="button"
          className="w-7 h-7 rounded-md grid place-items-center hover:bg-codex-surface-raised hover:text-codex-text"
          title={t("openDocs")}
          aria-label={t("openDocs")}
        >
          <ExternalLink size={13} />
        </button>
        <button
          type="button"
          className="w-7 h-7 rounded-md grid place-items-center hover:bg-codex-surface-raised hover:text-codex-text"
          title={t("editModel")}
          aria-label={t("editModel")}
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="w-7 h-7 rounded-md grid place-items-center hover:bg-codex-surface-raised hover:text-codex-danger"
          title={t("deleteModel")}
          aria-label={t("deleteModel")}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5">
      <label className="block text-[12px] text-codex-muted mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function inferGroup(apiBase: string): string {
  if (apiBase.includes("bigmodel")) return "智谱";
  if (apiBase.includes("moonshot")) return "月之暗面";
  if (apiBase.includes("deepseek")) return "DeepSeek";
  if (apiBase.includes("dashscope") || apiBase.includes("aliyun")) return "阿里通义";
  if (apiBase.includes("anthropic")) return "Anthropic";
  if (apiBase.includes("openai.com")) return "OpenAI";
  return "自定义供应商";
}

function resolveApiBase(_format: "openai" | "anthropic" | "responses", baseUrl: string): string {
  // When switching format, ensure baseUrl ends with correct path
  if (!baseUrl) return baseUrl;
  return baseUrl;
}

// ── Add Provider Modal ───────────────────────────────────────────────────────

interface AddProviderModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function AddProviderModal({ onClose, onCreated }: AddProviderModalProps) {
  const { t } = useTranslation("settings");
  const addProvider = useProvidersStore((s) => s.addProvider);

  const [name, setName] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [format, setFormat] = useState<"openai" | "anthropic" | "responses">("openai");
  const [models, setModels] = useState<{ id: string; ctx: string }[]>([]);
  const [newModelId, setNewModelId] = useState("");
  const [newModelCtx, setNewModelCtx] = useState("1000000");

  const canSubmit = name.trim() && apiBase.trim() && models.length > 0;

  const handleAddModel = () => {
    const id = newModelId.trim();
    if (!id) return;
    setModels((prev) => [...prev, { id, ctx: newModelCtx }]);
    setNewModelId("");
    setNewModelCtx("1000000");
  };

  const handleRemoveModel = (index: number) => {
    setModels((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    try {
      await addProvider({
        name: name.trim(),
        api_key: apiKey,
        api_key_env: "",
        api_base: apiBase.trim(),
        models: models.map((m) => m.id),
        extra_headers: {},
        max_retries: 3,
        timeout_seconds: 120,
        stream_include_usage: true,
        rate_limit_rpm: 0,
      });
      onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "添加失败");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60" onClick={onClose}>
      <div
        className="bg-codex-surface border border-codex-border rounded-xl w-[520px] max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[15px] font-semibold text-codex-text mb-1">{t("createProvider")}</div>
        <div className="text-[12px] text-codex-muted mb-4">{t("createProviderSub")}</div>

        <Field label={t("providerName")}>
          <input
            className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 text-[13px] text-codex-text outline-none focus:border-codex-accent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：智谱 GLM"
            spellCheck={false}
            autoFocus
          />
        </Field>

        <Field label="Base URL">
          <input
            className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 text-[13px] text-codex-text outline-none focus:border-codex-accent"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder="https://api.example.com/v1"
            spellCheck={false}
            autoComplete="off"
          />
        </Field>

        <Field label={t("apiKey")}>
          <input
            className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 text-[13px] text-codex-text outline-none focus:border-codex-accent"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            spellCheck={false}
            autoComplete="off"
          />
        </Field>

        <Field label={t("apiFormat")}>
          <select
            className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 text-[13px] text-codex-text outline-none focus:border-codex-accent"
            value={format}
            onChange={(e) => setFormat(e.target.value as "openai" | "anthropic" | "responses")}
          >
            <option value="openai">{t("formatChatCompletions")}</option>
            <option value="responses">{t("formatResponses")}</option>
            <option value="anthropic">{t("formatAnthropic")}</option>
          </select>
        </Field>

        {/* Models section */}
        <div className="text-[13px] font-medium text-codex-muted mt-5 mb-2">{t("modelList")}</div>
        <div className="border border-dashed border-codex-border-input rounded-lg p-3 bg-codex-bg mb-3">
          {models.length > 0 ? (
            <div className="space-y-1.5 mb-2">
              {models.map((m, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-codex-surface">
                  <span className="flex-1 text-[13px] text-codex-text">{m.id}</span>
                  <span className="text-[11px] text-codex-muted">{m.ctx}K</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveModel(i)}
                    className="text-codex-muted hover:text-codex-danger"
                    aria-label={t("deleteModel")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-codex-muted py-2 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7h.01" />
              </svg>
              <span>{t("modelRequired")}</span>
            </div>
          )}
          <div className="flex gap-2">
            <input
              className="flex-1 bg-codex-bg border border-codex-border-input rounded px-2 py-1.5 text-[12px] text-codex-text outline-none focus:border-codex-accent"
              value={newModelId}
              onChange={(e) => setNewModelId(e.target.value)}
              placeholder={t("modelId")}
              onKeyDown={(e) => e.key === "Enter" && handleAddModel()}
            />
            <input
              className="w-20 bg-codex-bg border border-codex-border-input rounded px-2 py-1.5 text-[12px] text-codex-text outline-none focus:border-codex-accent font-mono"
              value={newModelCtx}
              onChange={(e) => setNewModelCtx(e.target.value.replace(/\D/g, ""))}
              placeholder="上下文"
              inputMode="numeric"
            />
            <button
              type="button"
              onClick={handleAddModel}
              disabled={!newModelId.trim()}
              className="px-2 py-1.5 rounded text-[12px] text-codex-accent hover:bg-codex-accent/10 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-codex-border-input">
          <div className="text-[11px] text-codex-muted">
            {models.length === 0 && t("modelRequired")}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-[13px] text-codex-muted hover:bg-codex-surface-raised"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-3 py-1.5 rounded-lg text-[13px] bg-codex-accent text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("createProvider")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Import Page (unchanged) ──────────────────────────────────────────────────

export function ImportPage() {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("import")}</PageTitle>
      <PageSub>{t("importDesc")}</PageSub>
      <div className="text-[13px] font-medium text-codex-muted mb-2.5">{t("autoSync")}</div>
      <SettingsCard>
        <SettingsRow label={t("keepSync")} desc={"自动同步模型配置"}>
          <Toggle checked label={t("keepSync")} />
        </SettingsRow>
        <SettingsRow label={t("contentToSync")} desc={t("contentToSyncDesc")}>
          <ActionBtn>{t("customize")}</ActionBtn>
        </SettingsRow>
      </SettingsCard>
      <div className="text-[13px] font-medium text-codex-muted mb-1">{t("importFromApps")}</div>
      <p className="text-xs text-codex-muted mb-2.5">{t("importDetected")}</p>
      <SettingsCard>
        {[
          { name: "Claude Code", color: "#f97316" },
          { name: "Cursor", color: "#fff" },
        ].map((app) => (
          <SettingsRow
            key={app.name}
            label={
              <span className="inline-flex items-center gap-2.5">
                <span
                  className="w-7 h-7 rounded-md grid place-items-center text-[11px] font-bold"
                  style={{ background: app.color, color: app.color === "#fff" ? "#181818" : "#fff" }}
                >
                  {app.name[0]}
                </span>
                {app.name}
              </span>
            }
          >
            <ActionBtn>{t("import")}</ActionBtn>
          </SettingsRow>
        ))}
      </SettingsCard>
    </div>
  );
}
