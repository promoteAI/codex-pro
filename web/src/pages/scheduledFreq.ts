/** Map between human-readable schedule labels (prototype) and cron expressions. */

export type SchFilter = "all" | "on" | "paused" | "done";

export type SchStatus = "on" | "paused" | "done";

/** Reasoning levels; stored as English ids matching `ui.preferences.reasoning_levels`.
 *  `reasoning` in FreqState shares this field with the settings picker. */
export const REASONING_LEVELS = ["low", "medium", "high", "xhigh", "max", "Ultra"] as const;

/** Display labels for reasoning levels (ScheduledView is a zh-only page). */
export const REASONING_LABELS: Record<string, string> = {
  low: "轻度",
  medium: "中",
  high: "高",
  xhigh: "极高",
  max: "最高",
  Ultra: "Ultra",
};

export interface FreqState {
  repeat: string;
  unit: string;
  interval: string;
  weekday: string;
  time: string;
  notify: string;
  project: string;
  model: string;
  reasoning: string;
}

export const DEFAULT_FREQ: FreqState = {
  repeat: "每小时",
  unit: "每周",
  interval: "1 周",
  weekday: "星期一",
  time: "20:30",
  notify: "所有运行",
  project: "codex-pro",
  model: "agnes-2.5-flash",
  reasoning: "low",
};

export const FREQ_OPTIONS: Record<keyof FreqState, string[]> = {
  repeat: ["每小时", "每天", "工作日", "每周", "自定义"],
  unit: ["每天", "每周", "每月"],
  interval: ["1 周", "2 周", "3 周", "4 周"],
  weekday: ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"],
  time: (() => {
    const slots: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return slots;
  })(),
  notify: ["所有运行", "仅失败", "从不"],
  project: ["codex-pro", "无项目"],
  model: ["agnes-2.5-flash", "agnes-2.0-flash", "5.6 Luna", "5.4 Instant", "o3", "o4-mini"],
  reasoning: [...REASONING_LEVELS],
};

const WEEKDAY_CRON: Record<string, string> = {
  星期日: "0",
  星期一: "1",
  星期二: "2",
  星期三: "3",
  星期四: "4",
  星期五: "5",
  星期六: "6",
};

const CRON_WEEKDAY: Record<string, string> = Object.fromEntries(
  Object.entries(WEEKDAY_CRON).map(([k, v]) => [v, k]),
);

function parseTime(expr: string): { min: string; hour: string } | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const [min, hour] = parts;
  if (!/^\d{1,2}$/.test(min) || !/^\d{1,2}$/.test(hour)) return null;
  return {
    min: String(Number(min)).padStart(2, "0"),
    hour: String(Number(hour)).padStart(2, "0"),
  };
}

/** Human label for a cron expression (list meta / frequency pill). */
export function cronToLabel(expr: string): string {
  const e = (expr || "").trim();
  if (!e) return "手动";
  if (/^0 \* \* \* \*$/.test(e) || /^\* \* \* \* \*$/.test(e)) return "每小时";
  const t = parseTime(e);
  const parts = e.split(/\s+/);
  if (t && parts.length >= 5) {
    const [, , dom, mon, dow] = parts;
    const time = `${t.hour}:${t.min}`;
    if (dom === "*" && mon === "*" && dow === "1-5") return `工作日 ${time}`;
    if (dom === "*" && mon === "*" && dow === "*") return `每天 ${time}`;
    if (dom === "*" && mon === "*" && /^\d$/.test(dow)) {
      return `${CRON_WEEKDAY[dow] || "每周"} ${time}`;
    }
  }
  return e;
}

/** Seed frequency UI state from a cron expression. */
export function cronToFreq(expr: string, base: FreqState = DEFAULT_FREQ): FreqState {
  const e = (expr || "").trim();
  const next = { ...base };
  if (/^0 \* \* \* \*$/.test(e) || /^\* \* \* \* \*$/.test(e)) {
    next.repeat = "每小时";
    return next;
  }
  const t = parseTime(e);
  const parts = e.split(/\s+/);
  if (t && parts.length >= 5) {
    const [, , dom, mon, dow] = parts;
    next.time = `${t.hour}:${t.min}`;
    if (dom === "*" && mon === "*" && dow === "1-5") {
      next.repeat = "工作日";
      return next;
    }
    if (dom === "*" && mon === "*" && dow === "*") {
      next.repeat = "每天";
      return next;
    }
    if (dom === "*" && mon === "*" && /^\d$/.test(dow)) {
      next.repeat = "每周";
      next.weekday = CRON_WEEKDAY[dow] || "星期一";
      return next;
    }
  }
  next.repeat = "自定义";
  return next;
}

/** Build a cron expression from frequency UI state. */
export function freqToCron(freq: FreqState): string {
  const [hh, mm] = (freq.time || "20:30").split(":");
  const min = String(Number(mm) || 0);
  const hour = String(Number(hh) || 0);
  switch (freq.repeat) {
    case "每小时":
      return "0 * * * *";
    case "每天":
      return `${min} ${hour} * * *`;
    case "工作日":
      return `${min} ${hour} * * 1-5`;
    case "每周":
      return `${min} ${hour} * * ${WEEKDAY_CRON[freq.weekday] ?? "1"}`;
    case "自定义": {
      if (freq.unit === "每天") {
        const n = Number(freq.interval.replace(/\D/g, "")) || 1;
        return n <= 1 ? `${min} ${hour} * * *` : `${min} ${hour} */${n} * *`;
      }
      if (freq.unit === "每月") {
        return `${min} ${hour} 1 * *`;
      }
      // 每周 + interval
      const weeks = Number(freq.interval.replace(/\D/g, "")) || 1;
      if (weeks <= 1) return `${min} ${hour} * * ${WEEKDAY_CRON[freq.weekday] ?? "1"}`;
      return `${min} ${hour} * * ${WEEKDAY_CRON[freq.weekday] ?? "1"}`;
    }
    default:
      return "0 * * * *";
  }
}

export function intervalsForUnit(unit: string): string[] {
  if (unit === "每天") return ["1 天", "2 天", "3 天"];
  if (unit === "每月") return ["1 月", "2 月", "3 月"];
  return ["1 周", "2 周", "3 周", "4 周"];
}

export function jobSchStatus(enabled: boolean, status: string): SchStatus {
  if (status === "done" || status === "completed" || status === "finished") return "done";
  return enabled ? "on" : "paused";
}

export const STATUS_LABEL: Record<SchStatus, string> = {
  on: "已开启",
  paused: "已暂停",
  done: "已完成",
};

export interface SuggestItem {
  id: string;
  icon: "bell" | "review" | "follow";
  name: string;
  when: string;
  desc: string;
  prompt: string;
  cron: string;
  freq: Partial<FreqState>;
}

export const SUGGESTIONS: SuggestItem[] = [
  {
    id: "daily-brief",
    icon: "bell",
    name: "每日简报",
    when: "工作日 8:00",
    desc: "以日历、未读电子邮件和优先事项摘要开启每个工作日",
    prompt: "汇总今天的日历、未读邮件与优先事项，生成一份简明的每日简报。",
    cron: "0 8 * * 1-5",
    freq: { repeat: "工作日", time: "08:00" },
  },
  {
    id: "weekly-review",
    icon: "review",
    name: "每周回顾",
    when: "星期五（时间：16:00）",
    desc: "每周五将你最近的工作整理成简明的状态更新",
    prompt: "整理本周完成的工作与未完成事项，生成一份周五状态更新。",
    cron: "0 16 * * 5",
    freq: { repeat: "每周", weekday: "星期五", time: "16:00" },
  },
  {
    id: "follow-up",
    icon: "follow",
    name: "跟进监控",
    when: "工作日 9:00",
    desc: "查看最近的电子邮箱和日历活动，并标记需要你关注的事项",
    prompt: "查看最近的邮箱与日历活动，列出需要跟进的事项并按优先级排序。",
    cron: "0 9 * * 1-5",
    freq: { repeat: "工作日", time: "09:00" },
  },
];
