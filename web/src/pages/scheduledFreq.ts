/** Map between human-readable schedule labels (prototype) and cron expressions. */

export type SchFilter = "all" | "on" | "paused" | "done";

export type SchStatus = "on" | "paused" | "done";

/** Reasoning levels; stored as English ids matching `ui.preferences.reasoning_levels`.
 *  `reasoning` in FreqState shares this field with the settings picker. */
export const REASONING_LEVELS = ["low", "medium", "high", "xhigh", "max", "Ultra"] as const;

/** i18n key path (scheduled ns) for each reasoning-level display label. */
export const REASONING_KEY_LABELS: Record<string, string> = {
  low: "reasoning.low",
  medium: "reasoning.medium",
  high: "reasoning.high",
  xhigh: "reasoning.xhigh",
  max: "reasoning.max",
  Ultra: "reasoning.ultra",
};

/** i18n key path (scheduled ns) for each weekday value. Values are the canonical zh names. */
export const WEEKDAY_KEYS: Record<string, string> = {
  星期日: "weekday.sun",
  星期一: "weekday.mon",
  星期二: "weekday.tue",
  星期三: "weekday.wed",
  星期四: "weekday.thu",
  星期五: "weekday.fri",
  星期六: "weekday.sat",
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
  // Models are loaded dynamically from the providers store at render time.
  // This default is a fallback for when no provider is configured.
  model: "agnes-2.5-flash",
  reasoning: "low",
};

/** Canonical internal values for each frequency field (what freqToCron reads).
 *  The UI should translate these for display via FREQ_VALUE_KEYS. */
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
  // WARNING: model options are dynamic (see ScheduledView.tsx providers store).
  // Do NOT use this array for the UI dropdown — it lists legacy placeholder models.
  model: ["agnes-2.5-flash", "agnes-2.0-flash", "5.6 Luna", "5.4 Instant", "o3", "o4-mini"],
  reasoning: [...REASONING_LEVELS],
};

/** Map each canonical frequency value to an i18n key path (scheduled ns).
 *  Structured per field so the render layer can translate stored values without
 *  any runtime dependency on the i18n instance. */
export const FREQ_VALUE_KEYS: Partial<Record<keyof FreqState, Record<string, string>>> = {
  repeat: {
    每小时: "repeat.hourly",
    每天: "repeat.daily",
    工作日: "repeat.workday",
    每周: "repeat.weekly",
    自定义: "repeat.custom",
  },
  unit: {
    每天: "unit.daily",
    每周: "unit.weekly",
    每月: "unit.monthly",
  },
  interval: {
    "1 周": "interval.week1",
    "2 周": "interval.week2",
    "3 周": "interval.week3",
    "4 周": "interval.week4",
    "1 天": "interval.day1",
    "2 天": "interval.day2",
    "3 天": "interval.day3",
    "1 月": "interval.month1",
    "2 月": "interval.month2",
    "3 月": "interval.month3",
  },
  weekday: {
    星期日: "weekday.sun",
    星期一: "weekday.mon",
    星期二: "weekday.tue",
    星期三: "weekday.wed",
    星期四: "weekday.thu",
    星期五: "weekday.fri",
    星期六: "weekday.sat",
  },
  notify: {
    所有运行: "notify.all",
    仅失败: "notify.failOnly",
    从不: "notify.never",
  },
  project: {
    "codex-pro": "project.codexPro",
    无项目: "project.none",
  },
  reasoning: REASONING_KEY_LABELS,
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

/** Human label for a cron expression (list meta / frequency pill).
 *  Kept as zh-only for back-compat with external callers/tests. Use an i18n-aware
 *  resolution via cronToLabelMeta in the UI instead. */
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

export interface CronLabelMeta {
  key: string;
  params: Record<string, string>;
}

/** i18n-aware cron label: returns an i18n key + interpolation params for the
 *  scheduled ns. Render as t(meta.key, meta.params), translating the weekday
 *  param for weekly labels via WEEKDAY_KEYS. */
export function cronToLabelMeta(expr: string): CronLabelMeta {
  const e = (expr || "").trim();
  if (!e) return { key: "cronManual", params: {} };
  if (/^0 \* \* \* \*$/.test(e) || /^\* \* \* \* \*$/.test(e)) return { key: "repeatHourly", params: {} };
  const t = parseTime(e);
  const parts = e.split(/\s+/);
  if (t && parts.length >= 5) {
    const [, , dom, mon, dow] = parts;
    const time = `${t.hour}:${t.min}`;
    if (dom === "*" && mon === "*" && dow === "1-5") return { key: "repeatWorkdayWithTime", params: { time } };
    if (dom === "*" && mon === "*" && dow === "*") return { key: "repeatDailyWithTime", params: { time } };
    if (dom === "*" && mon === "*" && /^\d$/.test(dow)) {
      return { key: "repeatWeeklyWithTime", params: { weekday: CRON_WEEKDAY[dow] || "星期一", time } };
    }
  }
  return { key: "cronExpression", params: { expr: e } };
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

/** i18n key path (scheduled ns) for each status label. */
export const STATUS_KEYS: Record<SchStatus, string> = {
  on: "status.on",
  paused: "status.paused",
  done: "status.done",
};

export function jobSchStatus(enabled: boolean, status: string): SchStatus {
  if (status === "done" || status === "completed" || status === "finished") return "done";
  return enabled ? "on" : "paused";
}

export interface SuggestItem {
  id: string;
  icon: "bell" | "review" | "follow";
  /** i18n key path (scheduled ns) for the display name. */
  nameKey: string;
  /** i18n key path (scheduled ns) for the "when" subtitle. */
  whenKey: string;
  /** i18n key path (scheduled ns) for the description. */
  descKey: string;
  /** i18n key path (scheduled ns) for the task prompt. */
  promptKey: string;
  cron: string;
  freq: Partial<FreqState>;
}

export const SUGGESTIONS: SuggestItem[] = [
  {
    id: "daily-brief",
    icon: "bell",
    nameKey: "suggest.dailyBrief",
    whenKey: "suggest.dailyBriefWhen",
    descKey: "suggest.dailyBriefDesc",
    promptKey: "suggest.dailyBriefPrompt",
    cron: "0 8 * * 1-5",
    freq: { repeat: "工作日", time: "08:00" },
  },
  {
    id: "weekly-review",
    icon: "review",
    nameKey: "suggest.weeklyReview",
    whenKey: "suggest.weeklyReviewWhen",
    descKey: "suggest.weeklyReviewDesc",
    promptKey: "suggest.weeklyReviewPrompt",
    cron: "0 16 * * 5",
    freq: { repeat: "每周", weekday: "星期五", time: "16:00" },
  },
  {
    id: "follow-up",
    icon: "follow",
    nameKey: "suggest.followUp",
    whenKey: "suggest.followUpWhen",
    descKey: "suggest.followUpDesc",
    promptKey: "suggest.followUpPrompt",
    cron: "0 9 * * 1-5",
    freq: { repeat: "工作日", time: "09:00" },
  },
];
