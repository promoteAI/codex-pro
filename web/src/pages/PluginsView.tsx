import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Skills } from "./Skills";
import { useApi } from "../hooks/use-api";

interface MarketplaceItem {
  name: string;
  scope: string;
  desc: string;
  version?: string;
  author?: string;
}

export function PluginsView() {
  const { t } = useTranslation("nav");
  const [tab, setTab] = useState<"skills" | "market">("skills");
  const [scope, setScope] = useState<"all" | "installed" | "public">("all");
  const [q, setQ] = useState("");

  // Fetch live marketplace data from skills API
  const { data: skillsData, loading: skillsLoading, error: skillsError } = useApi<{ skills: MarketplaceItem[] }>("/skills");

  const market = useMemo(() => {
    const items = skillsData?.skills ?? [];
    return items.filter((p) => {
      if (scope === "installed" && p.scope !== "installed") return false;
      if (scope === "public" && p.scope !== "public") return false;
      if (q && !p.name.toLowerCase().includes(q.toLowerCase()) && !p.desc.toLowerCase().includes(q.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [scope, q, skillsData]);

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-codex-bg">
      <div className="px-8 pt-7 pb-2">
        <h1 className="text-[22px] font-semibold text-[#e8e8e8]">{t("plugins")}</h1>
        <div className="flex gap-4 mt-4 border-b border-codex-border">
          {(
            [
              ["skills", "Skills"],
              ["market", "Marketplace"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`pb-2 text-[13px] border-b-2 -mb-px ${
                tab === id
                  ? "text-[#e0e0e0] border-[#e0e0e0]"
                  : "text-codex-muted border-transparent hover:text-[#a0a0a0]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "skills" && (
        <div className="codex-admin-pane px-8 pb-10">
          <Skills />
        </div>
      )}

      {tab === "market" && (
        <div className="px-8 pb-10">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {(
              [
                ["all", "All"],
                ["installed", "Installed"],
                ["public", "Public"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setScope(id)}
                className={`px-3 py-1 rounded-full text-[12.5px] border ${
                  scope === id
                    ? "bg-[#2e2e2e] border-[#3a3a3a] text-[#e0e0e0]"
                    : "border-codex-border text-codex-muted hover:bg-codex-hover"
                }`}
              >
                {label}
              </button>
            ))}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search plugins..."
              className="ml-auto bg-codex-surface border border-codex-border rounded-lg px-3 py-1.5 text-[12.5px] outline-none w-[200px]"
            />
          </div>

          {skillsLoading && (
            <div className="text-codex-muted text-sm py-8 text-center">Loading marketplace...</div>
          )}
          {skillsError && (
            <div className="text-codex-danger text-sm py-8 text-center">Failed to load: {skillsError}</div>
          )}
          {!skillsLoading && !skillsError && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {market.map((p) => (
                <div
                  key={p.name}
                  className="text-left p-4 bg-codex-surface border border-codex-border rounded-[12px] hover:border-[#3a3a3a]"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-9 h-9 rounded-lg bg-[#252525] inline-flex items-center justify-center text-sm text-[#888]">
                      {p.name[0]}
                    </span>
                    <div>
                      <div className="text-[13.5px] text-[#d4d4d4] font-medium">{p.name}</div>
                      <div className="text-[11px] text-codex-muted">{p.scope}</div>
                    </div>
                  </div>
                  <p className="text-xs text-codex-muted leading-relaxed line-clamp-2">{p.desc}</p>
                </div>
              ))}
              {market.length === 0 && (
                <div className="col-span-full text-codex-muted text-sm py-8 text-center">
                  No plugins found
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

