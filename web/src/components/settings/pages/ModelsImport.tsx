import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Eye, EyeOff, Trash2, Plus, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActionBtn, PageSub, PageTitle, SettingsCard, SettingsRow, Toggle } from "../ui";
import { useProvidersStore, type ProviderEntry } from "../../../stores/providers";
import { toast } from "../../../stores/toast";

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
    testProvider,
    refreshHealth,
  } = useProvidersStore();

  const [active, setActiveLocal] = useState<ProviderEntry | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const [newName, setNewName] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [newApiBase, setNewApiBase] = useState("");
  const [newModels, setNewModels] = useState("");

  useEffect(() => {
    fetchProviders();
    refreshHealth();
    const interval = setInterval(refreshHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (providers.length > 0 && (!activeName || !providers.find((p) => p.name === activeName))) {
      setActive(providers[0].name);
    }
  }, [providers, activeName]);

  useEffect(() => {
    const found = providers.find((p) => p.name === activeName);
    if (found) setActiveLocal(found);
  }, [providers, activeName]);

  const groups = useMemo(() => {
    const map = new Map<string, ProviderEntry[]>();
    for (const p of providers) {
      const group = p.api_base.includes("bigmodel")
        ? "智谱"
        : p.api_base.includes("moonshot")
          ? "月之暗面"
          : p.api_base.includes("deepseek")
            ? "DeepSeek"
            : p.api_base.includes("dashscope")
              ? "阿里通义"
              : p.api_base.includes("anthropic")
                ? "Anthropic"
                : p.api_base.includes("openai.com")
                  ? "OpenAI"
                  : "自定义供应商";
      const list = map.get(group) ?? [];
      list.push(p);
      map.set(group, list);
    }
    return [...map.entries()];
  }, [providers]);

  const handleDelete = async (name: string) => {
    if (!confirm(t("deleteProviderConfirm", { name }))) return;
    try {
      await deleteProvider(name);
    } catch {
      // error already shown by toast
    }
  };

  const handleTest = async (name: string) => {
    await testProvider(name);
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newApiBase.trim()) {
      toast.error(t("addProviderRequire"));
      return;
    }
    try {
      await useProvidersStore.getState().addProvider({
        name: newName.trim(),
        api_key: newApiKey,
        api_key_env: "",
        api_base: newApiBase.trim(),
        models: newModels
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        extra_headers: {},
        max_retries: 3,
        timeout_seconds: 120,
        stream_include_usage: true,
        rate_limit_rpm: 0,
      });
      setShowAddModal(false);
      setNewName("");
      setNewApiKey("");
      setNewApiBase("");
      setNewModels("");
    } catch {
      // error already shown by toast
    }
  };

  const healthColor = (status?: string) => {
    switch (status) {
      case "healthy":
        return "bg-codex-success";
      case "degraded":
        return "bg-yellow-500";
      case "cooldown":
        return "bg-orange-500";
      case "disabled":
        return "bg-[#444]";
      default:
        return "bg-[#555]";
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
      <div className="flex items-start justify-between gap-4 mb-4 shrink-0">
        <div>
          <PageTitle>{t("modelsTitle")}</PageTitle>
          <PageSub>{t("modelsDesc")}</PageSub>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              fetchProviders();
              refreshHealth();
            }}
            className="w-8 h-8 rounded-lg border border-codex-border bg-codex-surface text-codex-muted grid place-items-center hover:bg-codex-surface-raised hover:text-codex-text"
            aria-label={t("refresh")}
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-codex-border bg-codex-accent/20 text-codex-accent text-[13px] hover:bg-codex-accent/30"
          >
            <Plus size={14} />
            {t("addProvider")}
          </button>
        </div>
      </div>

      {loading && providers.length === 0 ? (
        <div className="flex-1 grid place-items-center text-codex-muted text-sm">
          <Loader2 size={20} className="animate-spin mr-2" />
          {t("loading")}
        </div>
      ) : (
        <div className="flex flex-1 min-h-[420px] bg-codex-surface border border-codex-border rounded-xl overflow-hidden">
          {/* Sidebar */}
          <aside className="w-[220px] shrink-0 border-r border-codex-border bg-codex-bg flex flex-col">
            <div className="flex-1 overflow-y-auto p-3">
              {groups.map(([group, list]) => (
                <div key={group} className="mb-3.5">
                  <div className="text-[11.5px] text-codex-muted font-medium px-2 pb-2">{group}</div>
                  {list.map((p) => {
                    const h = p.health;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => setActive(p.name)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left mb-1 border ${
                          activeName === p.name
                            ? "bg-codex-surface border-codex-border-separator text-codex-text"
                            : "border-transparent text-codex-muted hover:bg-codex-surface"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${healthColor(h?.status)}`}
                          title={h?.status}
                        />
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
          </aside>

          {/* Detail panel */}
          <div className="flex-1 min-w-0 overflow-y-auto p-5">
            {active ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <div className="text-[16px] font-semibold text-codex-text flex-1">{active.name}</div>
                  {active.health && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        active.health.status === "healthy"
                          ? "bg-codex-success/20 text-codex-success"
                          : active.health.status === "degraded"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : active.health.status === "cooldown"
                              ? "bg-orange-500/20 text-orange-400"
                              : "bg-[#444]/20 text-[#888]"
                      }`}
                    >
                      {t(
                        `health${active.health.status.charAt(0).toUpperCase()}${active.health.status.slice(1)}`,
                      )}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleTest(active.name)}
                    disabled={testingName === active.name}
                    className="w-8 h-8 rounded-lg grid place-items-center text-codex-muted hover:bg-codex-surface-raised hover:text-codex-text"
                    aria-label={t("testConnection")}
                  >
                    {testingName === active.name ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(active.name)}
                    className="w-8 h-8 rounded-lg grid place-items-center text-codex-muted hover:bg-codex-surface-raised hover:text-codex-danger"
                    aria-label={t("delete")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

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

                <Field label="Base URL">
                  <input
                    className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 text-[13px] text-codex-text outline-none focus:border-codex-accent"
                    value={active.api_base}
                    readOnly
                  />
                </Field>

                <Field label={t("apiKey")}>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 pr-10 text-[13px] text-codex-text outline-none focus:border-codex-accent"
                      value={
                        active.api_key ||
                        (active.api_key_env ? `env:${active.api_key_env}` : "••••••••")
                      }
                      readOnly
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

                <Field label={t("modelList")}>
                  {active.models.length > 0 ? (
                    <div className="space-y-1.5">
                      {active.models.map((m) => (
                        <div
                          key={m}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg bg-codex-bg border border-codex-border-input"
                        >
                          <span className="flex-1 min-w-0 text-[13px] text-codex-text font-medium truncate">
                            {m}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[12px] text-codex-muted py-2">{t("noModels")}</div>
                  )}
                </Field>
              </>
            ) : (
              <div className="flex-1 grid place-items-center text-codex-muted text-sm">
                {t("selectProvider")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60">
          <div className="bg-codex-surface border border-codex-border rounded-xl w-[480px] p-5">
            <div className="text-[15px] font-semibold text-codex-text mb-4">{t("addProvider")}</div>
            <Field label={t("providerName")}>
              <input
                className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 text-[13px] text-codex-text outline-none focus:border-codex-accent"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. deepseek"
              />
            </Field>
            <Field label={t("apiBaseUrl")}>
              <input
                className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 text-[13px] text-codex-text outline-none focus:border-codex-accent"
                value={newApiBase}
                onChange={(e) => setNewApiBase(e.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </Field>
            <Field label={t("apiKey")}>
              <input
                className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 text-[13px] text-codex-text outline-none focus:border-codex-accent"
                type="password"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
              />
            </Field>
            <Field label={t("models")}>
              <input
                className="w-full bg-codex-bg border border-codex-border-input rounded-lg px-3 py-2 text-[13px] text-codex-text outline-none focus:border-codex-accent"
                value={newModels}
                onChange={(e) => setNewModels(e.target.value)}
                placeholder="gpt-4o, gpt-4o-mini"
              />
            </Field>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 rounded-lg text-[13px] text-codex-muted hover:bg-codex-surface-raised"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={handleAdd}
                className="px-3 py-1.5 rounded-lg text-[13px] bg-codex-accent text-white hover:opacity-90"
              >
                {t("save")}
              </button>
            </div>
          </div>
        </div>
      )}
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

export function ImportPage() {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("import")}</PageTitle>
      <PageSub>{t("importDesc")}</PageSub>
      <div className="text-[13px] font-medium text-codex-muted mb-2.5">{t("autoSync")}</div>
      <SettingsCard>
        <SettingsRow
          label={t("keepSync")}
          desc={"自动同步模型配置"}
        >
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
