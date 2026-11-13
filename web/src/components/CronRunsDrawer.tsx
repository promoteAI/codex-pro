import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useApi } from "../hooks/use-api";
import { dateTime } from "../lib/datetime";
import type { CronJob } from "../pages/cronTypes";

interface CronRun {
  ts: number;
  status: string;
  error: string | null;
  run_count: number;
}

/**
 * Run history for one scheduled job, from GET /cron/{id}/runs.
 *
 * The endpoint existed with no caller: the table's "last result" cell showed a
 * status string but never the error text behind a failure, so a job that had
 * been failing all week looked identical to one that had never run.
 *
 * History is persisted with the job and bounded to the latest 100 outcomes.
 */
export function CronRunsDrawer({ job, onClose }: { job: CronJob; onClose: () => void }) {
  const { t } = useTranslation(["cron", "common"]);
  const { data, loading, error } = useApi<{ runs: CronRun[] }>(`/cron/${job.id}/runs?limit=100`);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const runs = data?.runs ?? [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="cron-runs-title"
        className="bg-codex-surface w-full max-w-md h-full overflow-y-auto shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 id="cron-runs-title" className="font-semibold text-base">{t("runs")}</h2>
            <p className="text-xs text-codex-muted break-all">{job.name || job.id}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common:close")}
            className="p-1 rounded hover:bg-codex-hover shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="text-xs text-codex-danger bg-codex-danger/10 border border-codex-danger/20 rounded p-2">
            {t("common:loadFailed", { error })}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-codex-muted">{t("common:loading")}</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-codex-muted">{t("runsEmpty")}</p>
        ) : (
          <ul className="space-y-3">
            {runs.map((run) => (
              <li key={`${run.ts}-${run.status}`} className="border border-codex-border rounded p-3 space-y-1">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="text-codex-muted">{t("runTime")}</span>
                  <span className="font-mono">{dateTime(run.ts)}</span>
                </div>
                <div className="flex justify-between gap-2 text-xs">
                  <span className="text-codex-muted">{t("runStatus")}</span>
                  <span>{run.status}</span>
                </div>
                <div className="text-xs text-codex-muted">
                  {t("runCount", { count: run.run_count })}
                </div>
                {run.error && (
                  <div className="text-xs bg-codex-danger/10 text-codex-danger rounded p-2 whitespace-pre-wrap break-words">
                    <span className="font-medium">{t("runError")}: </span>{run.error}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-codex-muted border-t border-codex-border pt-3">{t("runsRetention")}</p>
      </aside>
    </div>
  );
}
