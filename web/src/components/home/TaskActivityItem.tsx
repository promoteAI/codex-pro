import { useState } from "react";
import { useTranslation } from "react-i18next";

/** SVG icons matching the prototype (doc / chevron / check / spin). */
const ICO_CHEV = (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ICO_OK = (
  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ICO_SPIN = (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <path d="M12 4a8 8 0 1 1-7.5 5.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** Chinese verb labels mapped from tool names, mirroring prototype toolVerb(). */
function toolVerb(name: string): string {
  const map: Record<string, string> = {
    read_file: "读取了文件",
    read_multiple_files: "读取了文件",
    write_file: "写入了文件",
    edit_file: "编辑了文件",
    search_files: "搜索了文件",
    list_dir: "列出了目录",
    exec: "运行了命令",
    process: "运行了命令",
    execute_code: "运行了代码",
    web_search: "联网搜索",
    web_fetch: "抓取了网页",
    memory: "使用了记忆",
    browser: "操作了浏览器",
    ls: "列出了目录",
    cat: "读取了文件",
    grep: "搜索了文件",
    find: "搜索了文件",
    rg: "搜索了文件",
    sed: "编辑了文件",
    awk: "编辑了文件",
  };
  return map[name] || `调用了 ${name}`;
}

function formatJsonish(raw: string): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function truncate(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…`;
}

function actionSummary(text: string, max = 120): string {
  const t = (text ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function shellSegments(text: string): { cmd: string; out: string } {
  const raw = (text ?? "").trim();
  const firstNewline = raw.indexOf("\n");
  if (firstNewline === -1) return { cmd: raw, out: "" };
  return { cmd: raw.slice(0, firstNewline), out: raw.slice(firstNewline + 1) };
}

export interface TaskActivityItemProps {
  title: string;
  toolName?: string;
  input?: string;
  output?: string;
  running?: boolean;
  defaultOpen?: boolean;
}

/**
 * Beautiful UI "task-rows" style activity row: a capsule with a running /
 * failed / done badge, an expandable detail body, and a semantic status pill.
 * Adapted from beautifului.dev task-rows.tsx to our tool-activity data shape.
 */
export function TaskActivityItem({
  title,
  toolName,
  input,
  output,
  running,
  defaultOpen,
}: TaskActivityItemProps) {
  const { t } = useTranslation("home");
  const [open, setOpen] = useState(defaultOpen || running);
  const hasInput = Boolean(input?.trim());
  const hasOutput = Boolean(output?.trim());
  const summary = actionSummary(formatJsonish(input ?? "") || output || "");
  const seg = shellSegments(input ?? output ?? "");
  const showCard = (hasInput || hasOutput) && (seg.cmd || seg.out);
  const verb = toolName ? toolVerb(toolName) : title;
  const done = !running;
  const openDetail = () => {
    setOpen((v) => !v);
  };

  return (
    <div className={`tr-row ${open ? "is-open" : ""}`} data-tool={title}>
      <button type="button" className="tr-head" aria-expanded={open} onClick={openDetail}>
        <span className="tr-badge">
          {running ? (
            <span className="bui-ring is-active" role="status">
              {ICO_SPIN}
              <span className="num" />
            </span>
          ) : (
            <span className="bui-badge is-ok">{ICO_OK}</span>
          )}
        </span>
        <span className="tr-label">{verb}</span>
        {summary && <span className="tr-amount">{actionSummary(summary, 40)}</span>}
        <span className={`tr-pill ${running ? "is-run" : done ? "is-ok" : "is-err"}`}>
          {running ? (
            <>
              <span className="bui-ring" aria-hidden>
                {ICO_SPIN}
                <span className="num" />
              </span>
              {t("toolRunning", { name: "" })}
            </>
          ) : (
            <>
              {ICO_OK}
              <span>{t("actDone")}</span>
            </>
          )}
        </span>
        <span className="tr-chev">{ICO_CHEV}</span>
      </button>

      {(showCard || hasInput || hasOutput) && (
        <div className="tr-detail">
          <div className="tr-detail-in">
            <div className="tr-detail-body">
              <span className="tr-line" aria-hidden />
              <div>
                {hasInput && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-[#777] pb-1">{t("toolInput")}</div>
                    <div className="shell-card">
                      <div className="shell-label">{title}</div>
                      <pre className="shell-pre">
                        {seg.cmd && <span className="cmd">{truncate(seg.cmd, 4000)}</span>}
                        {seg.out && (
                          <>
                            {seg.cmd && "\n"}
                            <span className="out">{truncate(seg.out, 4000)}</span>
                          </>
                        )}
                      </pre>
                    </div>
                  </div>
                )}
                {hasOutput && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-[#777] pt-1 pb-1">{t("toolOutput")}</div>
                    <div className="shell-card">
                      <div className="shell-label">{t("toolResult", { name: title })}</div>
                      <pre className="shell-pre">
                        <span className="out">{truncate(formatJsonish(output!), 4000)}</span>
                      </pre>
                    </div>
                  </div>
                )}
                {!hasInput && !hasOutput && <div className="text-[#777] py-2">{t("emptyContent")}</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
