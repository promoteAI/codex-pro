import { useEffect, useState } from "react";
import { X, Download, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api";
import { apiFetch } from "../lib/api";
import { runMutation, toast } from "../stores/toast";
import { useShellStore } from "../stores/shell";
import { Toggle } from "./settings/ui";

interface SkillDetail {
  name: string;
  content: string;
  description?: string;
  files: string[];
  enabled?: boolean;
}

interface SkillDeps {
  name: string;
  requires: string[];
  missing: string[];
  satisfied: boolean;
}

/**
 * Dark-themed skill detail panel matching the screenshot.
 * Shows enable toggle, skill content, deps, and actions.
 */
export function SkillDetailDrawer({
  name,
  canAdmin,
  onClose,
}: {
  name: string;
  canAdmin: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation(["skills", "common"]);
  const openSettings = useShellStore((s) => s.openSettings);
  const closeSettings = useShellStore((s) => s.closeSettings);

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const { data, loading, error } = useApi<SkillDetail>(`/skills/${encodeURIComponent(name)}`);
  const {
    data: deps,
    refetch: refetchDeps,
  } = useApi<SkillDeps>(`/skills/${encodeURIComponent(name)}/deps`);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (data?.enabled != null) setEnabled(data.enabled);
  }, [data]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!(target instanceof HTMLElement) || !target.closest('.skill-menu')) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const toggle = async () => {
    if (!canAdmin) return;
    setToggling(true);
    try {
      await apiFetch(`/skills/${encodeURIComponent(name)}/toggle`, {
        method: "POST",
        body: JSON.stringify({ enabled: !enabled }),
      });
      setEnabled((v) => !v);
      refetchDeps();
    } catch (e: unknown) {
      // Keep current state on failure
    } finally {
      setToggling(false);
    }
  };

  const install = async () => {
    const ok = await runMutation(
      () => apiFetch(`/skills/${encodeURIComponent(name)}/deps/install`, { method: "POST" }),
      { success: t("installSuccess"), error: t("installFailed") },
    );
    if (ok) refetchDeps();
  };

  const openInMarketplace = () => {
    setMenuOpen(false);
    onClose();
    // Close settings and open plugins marketplace
    closeSettings();
    setTimeout(() => openSettings("plugins"), 50);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-label={name}
        className="relative w-full max-w-2xl mx-4 max-h-[90vh] bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Header */}
        <div className="flex items-start gap-4 p-5 border-b border-[#2a2a2a]">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] flex items-center justify-center shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>

          {/* Title & Description */}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-white mb-2">{name}</h2>
            <p className="text-sm text-gray-400 leading-relaxed line-clamp-3">
              {data?.description?.trim() || data?.content?.split("\n").filter(l => l.trim() && !l.startsWith("#") && !l.startsWith("```")).slice(0, 3).join(" ") || "—"}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle */}
            <Toggle
              checked={!!enabled}
              disabled={toggling || !canAdmin}
              onChange={toggle}
              label={enabled ? "禁用" : "启用"}
            />

            {/* Menu */}
            <div className="relative skill-menu">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  hovered ? "bg-[#2a2a2a] text-gray-400 hover:text-white" : "text-gray-500"
                }`}
                aria-label="更多操作"
                title="更多操作"
              >
                <MoreHorizontal size={16} />
              </button>
              {menuOpen && data && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-[#252525] border border-[#333] rounded-xl shadow-xl overflow-hidden z-10">
                  <button
                    onClick={() => { setMenuOpen(false); openInMarketplace(); }}
                    className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-[#333] transition-colors"
                  >
                    打开
                  </button>
                  <button
                    onClick={async () => {
                      setMenuOpen(false);
                      if (data.files.length > 0) {
                        try {
                          const res = await apiFetch<{ path: string }>(
                            `/skills/${encodeURIComponent(name)}/path`,
                          );
                          if (res.path) {
                            await navigator.clipboard.writeText(res.path);
                            toast.info(`技能路径已复制到剪贴板：${res.path}`);
                          }
                        } catch (e: unknown) {
                          const detail = e instanceof Error ? e.message : String(e);
                          toast.error(`无法定位技能路径：${detail}`);
                          // 兜底：仍把可展示的技能名/路径文本给用户，并复制 SKILL.md 内容代替。
                          await navigator.clipboard.writeText(data.content || data.name || name);
                          toast.info("已将技能内容复制到剪贴板");
                        }
                      }
                    }}
                    className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-[#333] transition-colors border-t border-[#333]"
                  >
                    在文件资源管理器中显示
                  </button>
                  <button
                    onClick={async () => {
                      setMenuOpen(false);
                      await navigator.clipboard.writeText(data.content || "");
                    }}
                    className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-[#333] transition-colors border-t border-[#333]"
                  >
                    复制 Markdown
                  </button>
                </div>
              )}
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-[#2a2a2a] hover:text-white transition-colors"
              aria-label="关闭"
              title="关闭"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Description Section */}
          <section>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">说明</h3>
            <div className="bg-[#151515] rounded-xl p-4 border border-[#2a2a2a]">
              <pre className="text-sm text-gray-300 whitespace-pre-wrap break-words font-sans leading-relaxed max-h-[30vh] overflow-auto">
                {loading ? (
                  <span className="text-gray-500 animate-pulse">加载中...</span>
                ) : data?.content ? (
                  data.content
                ) : (
                  <span className="text-gray-500">暂无内容</span>
                )}
              </pre>
            </div>
          </section>

          {/* Dependencies Section */}
          {deps && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">依赖</h3>
                {deps.satisfied && (
                  <span className="text-xs text-green-500 flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    已满足
                  </span>
                )}
              </div>
              {deps.requires.length === 0 ? (
                <p className="text-sm text-gray-500 bg-[#151515] rounded-xl p-3 border border-[#2a2a2a]">
                  无依赖
                </p>
              ) : (
                <div className="bg-[#151515] rounded-xl border border-[#2a2a2a] overflow-hidden">
                  <ul className="divide-y divide-[#2a2a2a]">
                    {deps.requires.map((spec) => (
                      <li
                        key={spec}
                        className={`px-4 py-3 text-xs font-mono flex items-center justify-between ${
                          deps.missing.includes(spec) ? "text-amber-400" : "text-gray-400"
                        }`}
                      >
                        <span>{spec}</span>
                        {deps.missing.includes(spec) && (
                          <span className="text-xs text-amber-500 ml-2">缺失</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {!deps.satisfied && (
                    <div className="px-4 py-3 bg-[#1a1510] border-t border-[#2a2a2a]">
                      <button
                        onClick={install}
                        disabled={!canAdmin}
                        className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
                        title={canAdmin ? undefined : "需要管理员权限"}
                      >
                        <Download size={12} />
                        安装依赖
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Files Section */}
          {data && data.files.length > 0 && (
            <section>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                文件 ({data.files.length})
              </h3>
              <ul className="bg-[#151515] rounded-xl border border-[#2a2a2a] divide-y divide-[#2a2a2a]">
                {data.files.map((f) => (
                  <li key={f} className="px-4 py-3 text-xs font-mono text-gray-400 break-all hover:bg-[#1a1a1a]">
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Error State */}
        {error && (
          <div className="mx-5 mb-5 p-3 bg-red-900/20 border border-red-800 rounded-xl text-xs text-red-400">
            加载失败：{error}
          </div>
        )}
      </div>
    </div>
  );
}
