import { useTranslation } from "react-i18next";
import { Cron } from "./Cron";

/** Codex-styled scheduled tasks view — reuses Cron API/mutations. */
export function ScheduledView() {
  const { t } = useTranslation("nav");
  return (
    <div className="flex-1 min-h-0 overflow-auto bg-codex-bg">
      <div className="px-8 pt-7 pb-2">
        <h1 className="text-[22px] font-semibold text-[#e8e8e8]">{t("scheduled")}</h1>
        <p className="text-[12.5px] text-codex-muted mt-1">管理定时任务与无人值守授权</p>
      </div>
      <div className="codex-admin-pane px-8 pb-10">
        <Cron />
      </div>
    </div>
  );
}
