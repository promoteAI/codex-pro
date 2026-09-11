import { useMemo, useState, type ReactNode } from "react";
import { RefreshCw, Eye, EyeOff, Pencil, Trash2, ExternalLink, Box } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActionBtn, PageSub, PageTitle, SettingsCard, SettingsRow, Toggle } from "../ui";

interface Provider {
  id: string;
  name: string;
  group: string;
  brand?: boolean;
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  models: Array<{ id: string; badges: string[] }>;
}

const INITIAL: Provider[] = [
  {
    id: "bigmodel",
    name: "BigModel",
    group: "智谱",
    brand: true,
    enabled: false,
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKey: "",
    models: [],
  },
  {
    id: "agnes",
    name: "agnes",
    group: "自定义供应商",
    enabled: true,
    baseUrl: "https://apihub.agnes-ai.com/v1",
    apiKey: "sk-agnes-prototype-key-xxxxxx",
    models: [
      { id: "agnes-2.0-flash", badges: ["视觉", "65.5K"] },
      { id: "agnes-2.5-flash", badges: ["视觉", "65.5K"] },
    ],
  },
  {
    id: "hsmodel",
    name: "hsmodel",
    group: "自定义供应商",
    enabled: true,
    baseUrl: "https://api.hsmodel.example/v1",
    apiKey: "sk-hs-••••••••",
    models: [{ id: "hs-flash", badges: ["32K"] }],
  },
];

export function ModelsPage() {
  const { t } = useTranslation("settings");
  const [providers, setProviders] = useState(INITIAL);
  const [activeId, setActiveId] = useState("agnes");
  const [showKey, setShowKey] = useState(false);

  const active = providers.find((p) => p.id === activeId) ?? providers[0];
  const groups = useMemo(() => {
    const map = new Map<string, Provider[]>();
    for (const p of providers) {
      const list = map.get(p.group) ?? [];
      list.push(p);
      map.set(p.group, list);
    }
    return [...map.entries()];
  }, [providers]);

  const updateActive = (patch: Partial<Provider>) => {
    setProviders((prev) => prev.map((p) => (p.id === active.id ? { ...p, ...patch } : p)));
  };

  return (
    <div className="flex flex-col h-full min-h-0 max-w-[960px]">
      <div className="flex items-start justify-between gap-4 mb-4 shrink-0">
        <div>
          <PageTitle>{t("modelsTitle")}</PageTitle>
          <PageSub>{t("modelsDesc")}</PageSub>
        </div>
        <button
          type="button"
          className="w-8 h-8 rounded-lg border border-[#333] bg-[#222] text-[#888] grid place-items-center hover:bg-[#2a2a2a] hover:text-[#ddd]"
          aria-label={t("refresh")}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="flex flex-1 min-h-[420px] bg-[#1c1c1c] border border-[#2e2e2e] rounded-xl overflow-hidden">
        <aside className="w-[200px] shrink-0 border-r border-codex-border bg-[#1a1a1a] flex flex-col">
          <div className="flex-1 overflow-y-auto p-3">
            {groups.map(([group, list]) => (
              <div key={group} className="mb-3.5">
                <div className="text-[11.5px] text-[#6f6f6f] font-medium px-2 pb-2">{group}</div>
                {list.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActiveId(p.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left mb-1 border ${
                      active.id === p.id
                        ? "bg-[#252525] border-[#3a3a3a] text-[#f0f0f0]"
                        : "border-transparent text-[#c8c8c8] hover:bg-[#242424]"
                    }`}
                  >
                    <span
                      className={`w-[22px] h-[22px] rounded-md grid place-items-center shrink-0 ${
                        p.brand ? "bg-[#1e3a5f] text-[#5b9dff]" : "bg-[#2a2a2a] text-[#888]"
                      }`}
                    >
                      <Box size={12} />
                    </span>
                    <span className="flex-1 truncate">{p.name}</span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${p.enabled ? "bg-codex-success" : "bg-[#444]"}`}
                    />
                  </button>
                ))}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="m-2.5 py-2 rounded-lg border border-dashed border-[#3a3a3a] text-[12.5px] text-[#999] hover:bg-[#242424] hover:text-[#ddd]"
          >
            + {t("addProvider")}
          </button>
        </aside>

        <div className="flex-1 min-w-0 overflow-y-auto p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="text-[16px] font-semibold text-[#f0f0f0] flex-1">{active.name}</div>
            <SegEnable
              enabled={active.enabled}
              onChange={(enabled) => updateActive({ enabled })}
              onLabel={t("enabled")}
              offLabel={t("disabled")}
            />
            <button
              type="button"
              className="w-8 h-8 rounded-lg grid place-items-center text-[#888] hover:bg-[#2a2a2a] hover:text-codex-danger"
              aria-label={t("delete")}
            >
              <Trash2 size={14} />
            </button>
          </div>

          <Field label="Base URL">
            <input
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-[13px] text-[#e0e0e0] outline-none focus:border-[#555]"
              value={active.baseUrl}
              onChange={(e) => updateActive({ baseUrl: e.target.value })}
              spellCheck={false}
            />
          </Field>
          <Field label={t("apiFormat")}>
            <select className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-[13px] text-[#e0e0e0] outline-none">
              <option>Chat Completions (/chat/completions)</option>
              <option>Responses (/responses)</option>
              <option>Anthropic Messages (/v1/messages)</option>
            </select>
          </Field>
          <Field label="API Key">
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 pr-10 text-[13px] text-[#e0e0e0] outline-none focus:border-[#555]"
                value={active.apiKey}
                onChange={(e) => updateActive({ apiKey: e.target.value })}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888] hover:text-[#ddd]"
                onClick={() => setShowKey((v) => !v)}
                aria-label={t("toggleKey")}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>

          <div className="text-[13px] font-medium text-[#b8b8b8] mt-5 mb-2">{t("modelList")}</div>
          <div className="space-y-2">
            {active.models.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#1e1e1e] border border-[#262626]"
              >
                <div className="flex-1 min-w-0 text-[13px] text-[#d4d4d4] font-medium truncate">{m.id}</div>
                <div className="flex gap-1.5">
                  {m.badges.map((b) => (
                    <span
                      key={b}
                      className="text-[11px] text-[#888] bg-[#252525] border border-[#333] rounded px-1.5 py-0.5"
                    >
                      {b}
                    </span>
                  ))}
                </div>
                <div className="flex gap-0.5 text-[#777]">
                  <IconBtn aria={t("openDocs")}>
                    <ExternalLink size={13} />
                  </IconBtn>
                  <IconBtn aria={t("edit")}>
                    <Pencil size={13} />
                  </IconBtn>
                  <IconBtn aria={t("delete")} danger>
                    <Trash2 size={13} />
                  </IconBtn>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 w-full py-2 rounded-lg border border-dashed border-[#3a3a3a] text-[12.5px] text-[#999] hover:bg-[#242424]"
          >
            + {t("addModel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3.5">
      <label className="block text-[12px] text-[#888] mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function IconBtn({
  children,
  aria,
  danger,
}: {
  children: ReactNode;
  aria: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={aria}
      className={`w-7 h-7 rounded-md grid place-items-center hover:bg-[#2a2a2a] ${
        danger ? "hover:text-codex-danger" : "hover:text-[#ddd]"
      }`}
    >
      {children}
    </button>
  );
}

function SegEnable({
  enabled,
  onChange,
  onLabel,
  offLabel,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <div className="inline-flex rounded-md border border-[#3a3a3a] overflow-hidden text-[12px]">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-2.5 py-1 ${enabled ? "bg-[#2a3a2a] text-codex-success" : "text-[#888] hover:bg-[#252525]"}`}
      >
        {onLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-2.5 py-1 border-l border-[#3a3a3a] ${
          !enabled ? "bg-[#3a2a2a] text-codex-danger" : "text-[#888] hover:bg-[#252525]"
        }`}
      >
        {offLabel}
      </button>
    </div>
  );
}

export function ImportPage() {
  const { t } = useTranslation("settings");
  const [sync, setSync] = useState(true);
  return (
    <div className="max-w-[720px]">
      <PageTitle>{t("import")}</PageTitle>
      <PageSub>{t("importDesc")}</PageSub>
      <div className="text-[13px] font-medium text-[#b8b8b8] mb-2.5">{t("autoSync")}</div>
      <SettingsCard>
        <SettingsRow label={t("keepSync")} desc={sync ? t("keepSyncDescOn") : t("keepSyncDesc")}>
          <Toggle checked={sync} onChange={setSync} label={t("keepSync")} />
        </SettingsRow>
        <SettingsRow label={t("contentToSync")} desc={t("contentToSyncDesc")}>
          <ActionBtn>{t("customize")}</ActionBtn>
        </SettingsRow>
      </SettingsCard>
      <div className="text-[13px] font-medium text-[#b8b8b8] mb-1">{t("importFromApps")}</div>
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
