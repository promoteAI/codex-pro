import { useRef, useState } from "react";
import { useApi } from "../hooks/use-api";
import { apiFetch, apiUpload } from "../lib/api";
import { useWsSubscribe } from "../hooks/use-ws";
import { runMutation } from "../stores/toast";
import { useIsAdmin } from "../stores/capabilities";
import { Loadable } from "../components/Loadable";
import { useConfirm } from "../components/ConfirmDialog";
import { SkillDetailDrawer } from "../components/SkillDetailDrawer";
import { Zap, Trash2, Plus, Info, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Skill {
  name: string;
  description: string;
  enabled: boolean;
}

export function Skills() {
  const { t } = useTranslation(["skills", "common"]);
  const { data, loading, error, refetch } = useApi<{ skills: Skill[] }>("/skills");
  const confirm = useConfirm();
  // delete / import / deps-install / toggle are admin-guarded; only list and
  // read are open to a plain api token.
  const isAdmin = useIsAdmin();
  const canAdmin = isAdmin !== false;
  const [selected, setSelected] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importPath, setImportPath] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  useWsSubscribe(["skills"], () => refetch(), ["skill_changed"]);

  const toggle = async (name: string) => {
    const ok = await runMutation(() => apiFetch(`/skills/${encodeURIComponent(name)}/toggle`, { method: "POST" }), {
      error: t("toggleFailed"),
    });
    if (ok) refetch();
  };

  const remove = async (name: string) => {
    // delete_skill removes the whole skill directory from disk with no undo, so
    // spell that out rather than a bare "are you sure".
    const confirmed = await confirm({
      title: t("deleteConfirmTitle"),
      message: t("deleteConfirmMessage", { name }),
      confirmLabel: t("common:delete"),
      destructive: true,
    });
    if (!confirmed) return;
    const ok = await runMutation(
      () => apiFetch(`/skills/${encodeURIComponent(name)}`, { method: "DELETE" }),
      { success: t("deleteSuccess"), error: t("deleteFailed") },
    );
    if (ok) {
      // The drawer would otherwise keep polling a skill that no longer exists.
      if (selected === name) setSelected(null);
      refetch();
    }
  };

  const importSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    const path = importPath.trim();
    if (!path) return;
    const ok = await runMutation(
      () => apiFetch("/skills/import", { method: "POST", body: JSON.stringify({ path }) }),
      { success: t("importSuccess"), error: t("importFailed") },
    );
    if (ok) {
      setImportPath("");
      setShowImport(false);
      refetch();
    }
  };

  const uploadSkill = async (file: File) => {
    const ok = await runMutation(async () => {
      const form = new FormData();
      form.append("file", file, file.name);
      await apiUpload("/skills/upload", form);
    }, { success: t("uploadSuccess"), error: t("uploadFailed") });
    if (uploadRef.current) uploadRef.current.value = "";
    if (ok) { setShowImport(false); refetch(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-bold">{t("title")}</h1>
        <button
          onClick={() => setShowImport(!showImport)}
          disabled={!canAdmin}
          title={canAdmin ? undefined : t("common:adminOnly")}
          className="flex items-center gap-1 bg-codex-accent text-white px-3 py-1.5 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-codex-accent-hover"
        >
          <Plus size={16} /> {t("import")}
        </button>
      </div>

      {!canAdmin && (
        <div className="bg-codex-warn/10 text-codex-warn rounded-lg px-4 py-2 text-sm">
          {t("common:adminOnly")}
        </div>
      )}

      {showImport && canAdmin && (
        <form onSubmit={importSkill} className="bg-codex-surface border border-codex-border rounded p-4 space-y-3">
          <h2 className="text-sm font-medium">{t("importTitle")}</h2>
          <button type="button" onClick={() => uploadRef.current?.click()}
            className="w-full border-2 border-dashed border-codex-border rounded-lg p-5 text-sm text-codex-text-secondary hover:border-codex-accent hover:bg-codex-accent/10 flex flex-col items-center gap-2">
            <Upload size={22} className="text-codex-accent" />
            <span>{t("uploadZip")}</span><span className="text-xs text-codex-muted">{t("uploadHint")}</span>
          </button>
          <input ref={uploadRef} type="file" accept=".zip,application/zip" className="hidden"
            onChange={(event) => event.target.files?.[0] && uploadSkill(event.target.files[0])} />
          <div className="flex items-center gap-3 text-xs text-codex-muted"><span className="h-px bg-codex-border flex-1" />{t("orServerPath")}<span className="h-px bg-codex-border flex-1" /></div>
          <input
            value={importPath}
            onChange={(e) => setImportPath(e.target.value)}
            placeholder={t("importPathLabel")}
            aria-label={t("importPathLabel")}
            className="border border-codex-border rounded px-3 py-1.5 w-full font-mono text-xs bg-codex-bg"
          />
          <p className="text-xs text-codex-muted">{t("importPathHint")}</p>
          <button
            type="submit"
            disabled={!importPath.trim()}
            className="bg-codex-success text-white px-3 py-1.5 rounded text-sm disabled:opacity-50 hover:bg-codex-success/90"
          >
            {t("importSubmit")}
          </button>
        </form>
      )}

      <Loadable
        loading={loading}
        error={error}
        data={data}
        isEmpty={(d) => d.skills.length === 0}
        emptyText={t("empty")}
      >
        {(d) => (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {d.skills.map((skill) => (
              <div key={skill.name} className="bg-codex-surface border border-codex-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap size={16} className="text-codex-warn shrink-0" />
                    <span className="font-medium text-sm truncate">{skill.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setSelected(skill.name)}
                      aria-label={t("detailAria", { name: skill.name })}
                      title={t("detailTitle")}
                      className="p-1 rounded text-codex-muted hover:text-codex-text hover:bg-codex-hover"
                    >
                      <Info size={14} />
                    </button>
                    <button
                      onClick={() => remove(skill.name)}
                      disabled={!canAdmin}
                      aria-label={t("deleteAria", { name: skill.name })}
                      title={canAdmin ? t("common:delete") : t("common:adminOnly")}
                      className="p-1 rounded text-codex-danger hover:text-codex-danger hover:bg-codex-danger/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-codex-danger disabled:hover:bg-transparent"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      role="switch"
                      aria-checked={skill.enabled}
                      aria-label={t(skill.enabled ? "disableAria" : "enableAria", { name: skill.name })}
                      onClick={() => toggle(skill.name)}
                      disabled={!canAdmin}
                      title={canAdmin ? undefined : t("common:adminOnly")}
                      className={`w-10 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${skill.enabled ? "bg-codex-accent" : "bg-codex-border-strong"}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${skill.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-codex-muted">{skill.description || t("noDescription")}</p>
              </div>
            ))}
          </div>
        )}
      </Loadable>

      {selected && (
        <SkillDetailDrawer
          name={selected}
          canAdmin={canAdmin}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
