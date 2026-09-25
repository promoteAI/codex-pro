import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api";
import { useWsSubscribe } from "../hooks/use-ws";
import { apiFetch } from "../lib/api";
import { dateTime } from "../lib/datetime";
import { runMutation } from "../stores/toast";
import { useIsAdmin } from "../stores/capabilities";
import { useConfirm } from "../components/ConfirmDialog";
import { useProvidersStore } from "../stores/providers";
import type { CronJob } from "./Cron";
import {
  cronToFreq,
  cronToLabelMeta,
  DEFAULT_FREQ,
  FREQ_OPTIONS,
  FREQ_VALUE_KEYS,
  freqToCron,
  intervalsForUnit,
  jobSchStatus,
  STATUS_KEYS,
  SUGGESTIONS,
  type FreqState,
  type SchFilter,
  type SchStatus,
  type SuggestItem,
} from "./scheduledFreq";

interface CronRun {
  ts: number;
  status: string;
  error: string | null;
  run_count: number;
}

type MenuKind = "freq" | "more" | "detailMore" | "runin" | null;

interface MenuState {
  kind: MenuKind;
  key?: keyof FreqState;
  jobId?: string;
  anchor: DOMRect | null;
}

/** The "new chat each run" option is the only value runInLabel takes; store its i18n key. */
const RUNIN_NEW_KEY = "runin.newChat";

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

function MoreDots() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </svg>
  );
}

function jobPrompt(job: CronJob): string {
  const p = job.payload ?? {};
  const c = p.command ?? p.message;
  return typeof c === "string" ? c : "";
}

function jobCommandKey(job: CronJob | null): "command" | "message" {
  if (!job?.payload) return "command";
  const p = job.payload;
  return "message" in p && !("command" in p) ? "message" : "command";
}

function SuggestIcon({ kind }: { kind: SuggestItem["icon"] }) {
  if (kind === "bell") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M6.3 9.7a5.7 5.7 0 0 1 11.4 0c0 4.3 1.6 5.6 1.6 5.6H4.7s1.6-1.3 1.6-5.6Z" />
        <path d="M10 18.8a2.2 2.2 0 0 0 4 0" />
      </svg>
    );
  }
  if (kind === "review") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M9 11l2 2 4-4" />
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24">
      <path d="M3.5 8a2 2 0 0 1 2-2h4l2 2.3h7a2 2 0 0 1 2 2V16a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
      <circle cx="15" cy="14" r="3.2" />
      <path d="M17.3 16.3 19 18" />
    </svg>
  );
}

/** Codex-styled scheduled / automations view (prototype sch-view). */
export function ScheduledView() {
  const { t } = useTranslation(["scheduled", "common"]);
  const { data, loading, error, refetch } = useApi<{ jobs: CronJob[] }>("/cron");
  const isAdmin = useIsAdmin();
  const canWrite = isAdmin !== false;

  const providers = useProvidersStore((s) => s.providers);
  const fetchProviders = useProvidersStore((s) => s.fetchProviders);

  useEffect(() => {
    // Model list comes from live providers; best-effort so a missing store doesn't break the view.
    void fetchProviders().catch(() => {});
  }, [fetchProviders]);

  const modelOptions = useMemo(() => {
    const set = new Set<string>();
    providers.forEach((p) => p.models?.forEach((m) => set.add(m)));
    return set.size > 0 ? Array.from(set).sort() : [...FREQ_OPTIONS.model];
  }, [providers]);

  const [filter, setFilter] = useState<SchFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Keeps detail open right after create before list refetch lands the new row. */
  const [selectedSnapshot, setSelectedSnapshot] = useState<CronJob | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState>({ kind: null, anchor: null });
  const confirm = useConfirm();
  const [deleteTarget, setDeleteTarget] = useState<CronJob | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [freq, setFreq] = useState<FreqState>(DEFAULT_FREQ);
  const [runInLabel, setRunInLabel] = useState(RUNIN_NEW_KEY);
  const [runInQuery, setRunInQuery] = useState("");
  const [saving, setSaving] = useState(false);
  // Delivery slots — mirrors Cron.tsx's DELIVERY_KEYS; these are just UI state.
  const [deliverChannel, setDeliverChannel] = useState("");
  const [deliverChatId, setDeliverChatId] = useState("");
  const [sourceSessionKey, setSourceSessionKey] = useState("");
  const [payloadKeys, setPayloadKeys] = useState<Record<"channel"|"chatId"|"sessionKey", string | null>>({
    channel: null, chatId: null, sessionKey: null,
  });
  const [authorizeUnattended, setAuthorizeUnattended] = useState(false);
  const [authorizedSnapshot, setAuthorizedSnapshot] = useState("");

  const createWrapRef = useRef<HTMLDivElement>(null);
  const promptSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useWsSubscribe(["cron"], () => { refetch(); }, ["cron_run"]);

  const jobs = useMemo(() => data?.jobs ?? [], [data?.jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((job) => {
      const st = jobSchStatus(job.enabled, job.status);
      if (filter !== "all" && st !== filter) return false;
      if (!q) return true;
      const hay = `${job.name} ${job.cron_expr} ${jobPrompt(job)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [jobs, filter, query]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return jobs.find((j) => j.id === selectedId)
      ?? (selectedSnapshot?.id === selectedId ? selectedSnapshot : null);
  }, [jobs, selectedId, selectedSnapshot]);

  const { data: runsData, loading: runsLoading } = useApi<{ runs: CronRun[] }>(
    selected ? `/cron/${selected.id}/runs?limit=20` : null,
  );

  const closeMenus = useCallback(() => {
    setMenu({ kind: null, anchor: null });
    setCreateOpen(false);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (createWrapRef.current?.contains(t)) return;
      if ((t as HTMLElement).closest?.(".sch-freq-menu, .sch-more-menu, .sch-runin-panel")) return;
      closeMenus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenus();
        if (deleteTarget) setDeleteTarget(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [closeMenus, deleteTarget]);

  const openDetail = useCallback((job: CronJob) => {
    setSelectedId(job.id);
    setSelectedSnapshot(job);
    setPromptDraft(jobPrompt(job));
    setFreq(cronToFreq(job.cron_expr));
    // Seed delivery slots from job.payload so the user can edit them.
    const p = job.payload ?? {};
    const strVal = (v: unknown) => typeof v === "string" ? v : "";
    // Find which key the payload actually uses for each slot (may be alias).
    const findSlot = (keys: string[]) => {
      for (const k of keys) { if (k in p) return [k, strVal(p[k])]; }
      return [null as string | null, ""];
    };
    const [chKey, chVal] = findSlot(["deliver_channel", "channel"]);
    const [ciKey, ciVal] = findSlot(["deliver_chat_id", "chat_id"]);
    const [skKey, skVal] = findSlot(["source_session_key", "session_key"]);
    setDeliverChannel(chVal ?? "");
    setDeliverChatId(ciVal ?? "");
    setSourceSessionKey(skVal ?? "");
    setPayloadKeys({ channel: chKey, chatId: ciKey, sessionKey: skKey });
    setRunInLabel(RUNIN_NEW_KEY);
    // Authorization state is server-tracked; never pre-check the box.
    setAuthorizeUnattended(false);
    setAuthorizedSnapshot("");
    closeMenus();
  }, [closeMenus]);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setSelectedSnapshot(null);
    closeMenus();
  }, [closeMenus]);

  // Mirrors Cron.tsx's DELIVERY_KEYS for the client-side merge.
  const DELIVERY_SLOT_KEYS: Record<string, readonly string[]> = {
    channel: ["deliver_channel", "channel"],
    chatId: ["deliver_chat_id", "chat_id"],
    sessionKey: ["source_session_key", "session_key"],
  };

  const persistJob = useCallback(
    async (
      job: CronJob,
      patch: {
        name?: string;
        cron_expr?: string;
        enabled?: boolean;
        prompt?: string;
        authorize?: boolean;
      },
    ) => {
      if (!canWrite) return false;
      const key = jobCommandKey(job);
      const prompt = patch.prompt ?? jobPrompt(job);
      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.cron_expr !== undefined) body.cron_expr = patch.cron_expr;
      if (patch.enabled !== undefined) body.enabled = patch.enabled;
      if (patch.prompt !== undefined || patch.cron_expr !== undefined || patch.name !== undefined) {
        // Preserve existing payload keys (e.g. delivery targets) by merging
        // with the current stored payload, then overlaying the edited values.
        const current = (job.payload ?? {}) as Record<string, unknown>;
        const merged: Record<string, string> = { ...Object.fromEntries(
          Object.entries(current).filter(([, v]) => typeof v === "string")
        ) as Record<string, string> };
        merged[key] = prompt;
        // Keep delivery slot values from UI state if present.
        for (const [slot, uiVal] of [["channel", deliverChannel], ["chatId", deliverChatId], ["sessionKey", sourceSessionKey]] as const) {
          if (uiVal) {
            const existing = payloadKeys[slot];
            merged[existing ?? DELIVERY_SLOT_KEYS[slot][0]] = uiVal;
          }
        }
        body.payload = merged;
      }
      // Same consent-staleness guard as Cron.tsx.
      let authorizeFlag = false;
      if (patch.authorize === true) {
        const digest = JSON.stringify([
          prompt.trim(),
          (patch.cron_expr ?? job.cron_expr).trim(),
          [deliverChannel.trim(), deliverChatId.trim()].filter(Boolean).join(":") || sourceSessionKey.trim(),
        ]);
        if (digest === authorizedSnapshot) authorizeFlag = true;
        else setAuthorizeUnattended(false);
      }
      if (authorizeFlag) body.authorize_unattended = true;
      setSaving(true);
      const ok = await runMutation(
        () => apiFetch(`/cron/${job.id}`, { method: "PUT", body: JSON.stringify(body) }),
        { success: t("toast.saveSuccess"), error: t("toast.saveFailed") },
      );
      setSaving(false);
      if (ok) refetch();
      return ok;
    },
    [canWrite, refetch, jobPrompt, jobCommandKey, deliverChannel, deliverChatId, sourceSessionKey, payloadKeys, authorizedSnapshot, t],
  );

  const createAndSelect = useCallback(
    async (opts: { name: string; prompt: string; cron: string; freqPatch?: Partial<FreqState> }) => {
      if (!canWrite) return;
      closeMenus();
      const freqState = { ...DEFAULT_FREQ, ...opts.freqPatch };
      const cron = opts.cron || freqToCron(freqState);
      let createdId = "";
      setSaving(true);
      const ok = await runMutation(async () => {
        const res = (await apiFetch("/cron", {
          method: "POST",
          body: JSON.stringify({
            name: opts.name,
            cron_expr: cron,
            payload: { command: opts.prompt },
          }),
        })) as { id: string };
        createdId = res.id;
      }, { success: t("toast.createSuccess"), error: t("toast.createFailed") });
      setSaving(false);
      if (!ok || !createdId) return;
      await refetch();
      openDetail({
        id: createdId,
        name: opts.name,
        cron_expr: cron,
        enabled: true,
        status: "active",
        last_status: "",
        next_run_ms: null,
        payload: { command: opts.prompt },
      });
    },
    [canWrite, closeMenus, openDetail, refetch, t],
  );

  const schedulePromptSave = useCallback(
    (job: CronJob, value: string) => {
      setPromptDraft(value);
      if (promptSaveTimer.current) clearTimeout(promptSaveTimer.current);
      if (!canWrite) return;
      promptSaveTimer.current = setTimeout(() => {
        void persistJob(job, { prompt: value });
      }, 600);
    },
    [canWrite, persistJob],
  );

  const applyFreq = useCallback(
    async (patch: Partial<FreqState>) => {
      const next = { ...freq, ...patch };
      if (patch.unit) {
        const opts = intervalsForUnit(patch.unit);
        if (!opts.includes(next.interval)) next.interval = opts[0];
      }
      setFreq(next);
      if (!selected || !canWrite) return;
      const cron = freqToCron(next);
      await persistJob(selected, { cron_expr: cron, prompt: promptDraft });
    },
    [freq, selected, canWrite, persistJob, promptDraft],
  );

  const trigger = async (job: CronJob) => {
    if (!canWrite || !job.enabled) return;
    closeMenus();
    const ok = await runMutation(
      () => apiFetch(`/cron/${job.id}/trigger`, { method: "POST" }),
      { success: t("toast.triggerSuccess", { name: job.name || job.id }), error: t("toast.triggerFailed") },
    );
    if (ok) refetch();
  };

  const toggleEnabled = async (job: CronJob) => {
    if (!canWrite) return;
    closeMenus();
    await persistJob(job, { enabled: !job.enabled });
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !canWrite) return;
    const job = deleteTarget;
    setDeleteTarget(null);
    const ok = await runMutation(
      () => apiFetch(`/cron/${job.id}`, { method: "DELETE" }),
      { success: t("toast.deleteSuccess", { name: job.name || job.id }), error: t("toast.deleteFailed") },
    );
    if (ok) {
      if (selectedId === job.id) closeDetail();
      refetch();
    }
  };

  const openMenu = (kind: MenuKind, anchorEl: HTMLElement, extra: Partial<MenuState> = {}) => {
    const rect = anchorEl.getBoundingClientRect();
    setCreateOpen(false);
    setMenu((prev) =>
      prev.kind === kind && prev.key === extra.key && prev.jobId === extra.jobId
        ? { kind: null, anchor: null }
        : { kind, anchor: rect, ...extra },
    );
  };

  const statusOf = (job: CronJob): SchStatus => jobSchStatus(job.enabled, job.status);

  const hasDetail = !!selected;

  /** Translate a canonical frequency value (stored as the zh string the cron
   *  logic reads) into the current language; falls back to the value itself for
   *  fields without a mapping (e.g. models, time). */
  const trFreqValue = useCallback(
    (key: keyof FreqState, value: string): string => {
      const map = FREQ_VALUE_KEYS[key];
      const k = map?.[value];
      return k ? t(k) : value;
    },
    [t],
  );

  /** Render a cron-pill label, translating the weekday param for weekly exprs. */
  const cronLabelText = useCallback(
    (expr: string): string => {
      const meta = cronToLabelMeta(expr);
      if (meta.params.weekday) {
        return t(meta.key, { ...meta.params, weekday: trFreqValue("weekday", meta.params.weekday) });
      }
      return t(meta.key, meta.params);
    },
    [t, trFreqValue],
  );

  return (
    <section
      className={`sch-view${hasDetail ? " has-detail" : ""}`}
      aria-label={t("title")}
    >
      <div className="sch-list-pane">
        <div className={`sch-create-wrap${createOpen ? " open" : ""}`} ref={createWrapRef} id="schCreateWrap">
          <button
            className="sch-create-btn"
            type="button"
            aria-haspopup="menu"
            aria-expanded={createOpen}
            disabled={!canWrite || saving}
            onClick={(e) => {
              e.stopPropagation();
              setMenu({ kind: null, anchor: null });
              setCreateOpen((o) => !o);
            }}
          >
            {t("create")} <Chevron />
          </button>
          <div className="sch-create-menu" role="menu" aria-label={t("createMenu")}>
            <button
              className="sch-create-item"
              type="button"
              role="menuitem"
              onClick={() =>
                void createAndSelect({
                  name: t("createFromCodexDraft"),
                  prompt: t("createFromCodexPrompt"),
                  cron: "0 * * * *",
                })
              }
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {t("createFromCodex")}
            </button>
            <button
              className="sch-create-item"
              type="button"
              role="menuitem"
              onClick={() =>
                void createAndSelect({
                  name: t("createManualName"),
                  prompt: t("createManualPrompt"),
                  cron: "0 * * * *",
                  freqPatch: { repeat: "自定义" },
                })
              }
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              {t("createManual")}
            </button>
          </div>
        </div>

        <div className="sch-inner">
          <h1 className="sch-title">{t("title")}</h1>
          <p className="sch-sub">{t("subtitle")}</p>

          <div className="sch-filters" role="tablist" aria-label={t("filter.all")}>
            {(
              [
                ["all", "filter.all"],
                ["on", "filter.on"],
                ["paused", "filter.paused"],
                ["done", "filter.done"],
              ] as const
            ).map(([id, key]) => (
              <button
                key={id}
                type="button"
                className={`sch-filter${filter === id ? " active" : ""}`}
                onClick={() => setFilter(id)}
              >
                {t(key)}
              </button>
            ))}
          </div>

          <div className="sch-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4 4" />
            </svg>
            <input
              type="search"
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="sch-task-list" id="schTaskList">
            {loading && <div className="sch-task-meta" style={{ padding: "12px 10px" }}>{t("loading")}</div>}
            {!loading && error && (
              <div className="sch-task-meta" style={{ padding: "12px 10px", color: "#e85d5d" }}>
                {t("loadFailed", { error })}
              </div>
            )}
            {!loading && !error && filtered.length === 0 && (
              <div className="sch-task-meta" style={{ padding: "12px 10px" }}>{t("empty")}</div>
            )}
            {filtered.map((job) => {
              const st = statusOf(job);
              const selectedCls = selectedId === job.id ? " is-selected" : "";
              const moreOpen = menu.kind === "more" && menu.jobId === job.id ? " is-more-open" : "";
              return (
                <div
                  key={job.id}
                  className={`sch-task${selectedCls}${moreOpen}`}
                  data-status={st}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(job)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openDetail(job);
                    }
                  }}
                >
                  <div className="sch-task-icon" aria-hidden="true">
                    <PlayIcon />
                  </div>
                  <div className="sch-task-info">
                    <div className="sch-task-name">{job.name || job.id}</div>
                    <div className="sch-task-meta">{cronLabelText(job.cron_expr)}</div>
                  </div>
                  <button
                    type="button"
                    className={`sch-task-more${menu.kind === "more" && menu.jobId === job.id ? " is-active" : ""}`}
                    title={t("menu.more")}
                    aria-label={t("menu.more")}
                    aria-haspopup="menu"
                    aria-expanded={menu.kind === "more" && menu.jobId === job.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      openMenu("more", e.currentTarget, { jobId: job.id });
                    }}
                  >
                    <MoreDots />
                  </button>
                </div>
              );
            })}
          </div>

          {!hasDetail && (
            <>
              <div className="sch-suggest-title">{t("suggest.title")}</div>
              <div className="sch-suggest-list">
                {SUGGESTIONS.map((s) => (
                  <div
                    key={s.id}
                    className="sch-suggest"
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      void createAndSelect({
                        name: t(s.nameKey),
                        prompt: t(s.promptKey),
                        cron: s.cron,
                        freqPatch: s.freq,
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void createAndSelect({
                          name: t(s.nameKey),
                          prompt: t(s.promptKey),
                          cron: s.cron,
                          freqPatch: s.freq,
                        });
                      }
                    }}
                  >
                    <div className={`sch-suggest-icon ${s.icon}`} aria-hidden="true">
                      <SuggestIcon kind={s.icon} />
                    </div>
                    <div className="sch-suggest-info">
                      <div className="sch-suggest-name">{t(s.nameKey)}</div>
                      <div className="sch-suggest-when">{t(s.whenKey)}</div>
                      <div className="sch-suggest-desc">{t(s.descKey)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {selected && (
        <aside className="sch-detail open" aria-label={t("detail.title")}>
          <div className="sch-detail-head">
            <div className="sch-detail-head-main">
              <span className={`sch-detail-status is-${statusOf(selected)}`}>
                {t(STATUS_KEYS[statusOf(selected)])}
              </span>
              <h2 className="sch-detail-title">{selected.name || selected.id}</h2>
            </div>
            <div className="sch-detail-head-actions">
              <button
                type="button"
                className={`sch-detail-icon-btn${menu.kind === "detailMore" ? " is-active" : ""}`}
                title={t("menu.more")}
                aria-label={t("menu.more")}
                aria-haspopup="menu"
                aria-expanded={menu.kind === "detailMore"}
                onClick={(e) => {
                  e.stopPropagation();
                  openMenu("detailMore", e.currentTarget, { jobId: selected.id });
                }}
              >
                <MoreDots />
              </button>
              <button
                type="button"
                className="sch-detail-icon-btn"
                title={t("menu.triggerNow")}
                aria-label={t("menu.triggerNow")}
                disabled={!canWrite || !selected.enabled}
                onClick={() => void trigger(selected)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M10 8.5v7l6-3.5z" />
                </svg>
              </button>
              <button
                type="button"
                className="sch-detail-icon-btn"
                title={t("common:close")}
                aria-label={t("common:close")}
                onClick={closeDetail}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 7l10 10M17 7 7 17" />
                </svg>
              </button>
            </div>
          </div>

          <div className="sch-detail-body">
            <textarea
              className="sch-detail-prompt"
              aria-label={t("detail.prompt")}
              spellCheck={false}
              value={promptDraft}
              disabled={!canWrite}
              onChange={(e) => schedulePromptSave(selected, e.target.value)}
            />

            {canWrite && (
              <div className="sch-detail-section" aria-labelledby="schDetailSectionAuth">
                <div className="sch-freq-row" style={{ alignItems: "flex-start", gap: 8 }}>
                  <input
                    type="checkbox"
                    id="sch-authorize-unattended"
                    checked={authorizeUnattended}
                    disabled={!selected.enabled}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setAuthorizeUnattended(checked);
                      if (!checked) {
                        setAuthorizedSnapshot("");
                        return;
                      }
                      // Consent snapshot = what's on screen at the moment of check.
                      const digest = JSON.stringify([
                        promptDraft.trim(),
                        selected.cron_expr.trim(),
                        [deliverChannel.trim(), deliverChatId.trim()].filter(Boolean).join(":") || sourceSessionKey.trim(),
                      ]);
                      void confirm({
                        title: t("auth.confirmTitle"),
                        message: t("auth.confirmMessage", {
                          command: promptDraft.trim() || t("auth.unset"),
                          expr: selected.cron_expr,
                          target: [deliverChannel.trim(), deliverChatId.trim()].filter(Boolean).join(":") || sourceSessionKey.trim() || t("auth.noTarget"),
                        }),
                        confirmLabel: t("auth.confirmLabel"),
                        destructive: true,
                      }).then((ok) => {
                        if (ok) setAuthorizedSnapshot(digest);
                        else setAuthorizeUnattended(false);
                      });
                    }}
                    className="mt-0.5"
                  />
                  <label htmlFor="sch-authorize-unattended" className="text-sm flex-1">
                    {t("auth.unattended")}
                    <span className="block text-xs text-gray-500">
                      {t("auth.hint")}
                    </span>
                  </label>
                </div>
              </div>
            )}

            <section className="sch-detail-section" aria-labelledby="schDetailSectionDetails">
              <h3 className="sch-detail-section-title" id="schDetailSectionDetails">{t("detail.details")}</h3>
              <div className="sch-freq-card">
                <div className="sch-freq-row">
                  <span className="sch-detail-label">{t("detail.runIn")}</span>
                  <button
                    type="button"
                    className={`sch-freq-ctrl is-pill${menu.kind === "runin" ? " is-open" : ""}`}
                    aria-label={t("detail.runIn")}
                    aria-haspopup="dialog"
                    aria-expanded={menu.kind === "runin"}
                    onClick={(e) => {
                      e.stopPropagation();
                      openMenu("runin", e.currentTarget);
                      setRunInQuery("");
                    }}
                  >
                    <span className="sch-freq-ctrl-label">{t(runInLabel)}</span>
                    <Chevron />
                  </button>
                </div>
                {(
                  [
                    ["project", "detail.project"],
                    ["model", "detail.model"],
                    ["reasoning", "detail.reasoning"],
                  ] as const
                ).map(([key, labelKey]) => (
                  <div className="sch-freq-row" key={key}>
                    <span className="sch-detail-label">{t(labelKey)}</span>
                    <button
                      type="button"
                      className={`sch-freq-ctrl${menu.kind === "freq" && menu.key === key ? " is-open" : ""}`}
                      data-freq-key={key}
                      aria-haspopup="menu"
                      aria-expanded={menu.kind === "freq" && menu.key === key}
                      onClick={(e) => {
                        e.stopPropagation();
                        openMenu("freq", e.currentTarget, { key });
                      }}
                    >
                      <span className="sch-freq-ctrl-label">
                        {key === "reasoning" || key === "project"
                          ? trFreqValue(key, freq[key])
                          : freq[key]}
                      </span>
                      <Chevron />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section
              className={`sch-detail-section${freq.repeat === "自定义" ? " is-custom" : ""}`}
              aria-labelledby="schDetailSectionFreq"
            >
              <div className="sch-detail-section-head">
                <h3 className="sch-detail-section-title" id="schDetailSectionFreq">{t("detail.frequency")}</h3>
                <button
                  type="button"
                  className="sch-freq-gear"
                  title={t("detail.advancedFreq")}
                  aria-label={t("detail.advancedFreq")}
                  onClick={() =>
                    void applyFreq({ repeat: "自定义" })
                  }
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 3.5v2.2M12 18.3v2.2M4.9 6.5l1.6 1.6M17.5 15.9l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 17.5l1.6-1.6M17.5 8.1l1.6-1.6" />
                  </svg>
                </button>
              </div>
              <div className="sch-freq-card">
                <div className="sch-freq-row" data-freq-row="repeat" hidden={freq.repeat === "自定义"}>
                  <span className="sch-detail-label">{t("frequency.repeat")}</span>
                  <button
                    type="button"
                    className={`sch-freq-ctrl is-pill${menu.kind === "freq" && menu.key === "repeat" ? " is-open" : ""}`}
                    data-freq-key="repeat"
                    aria-haspopup="menu"
                    aria-expanded={menu.kind === "freq" && menu.key === "repeat"}
                    onClick={(e) => {
                      e.stopPropagation();
                      openMenu("freq", e.currentTarget, { key: "repeat" });
                    }}
                  >
                    <span className="sch-freq-ctrl-label">{trFreqValue("repeat", freq.repeat)}</span>
                    <Chevron />
                  </button>
                </div>
                <div className="sch-freq-row" data-freq-row="custom-unit" hidden={freq.repeat !== "自定义"}>
                  <span className="sch-detail-label">{t("frequency.customUnit")}</span>
                  <button
                    type="button"
                    className={`sch-freq-ctrl${menu.kind === "freq" && menu.key === "unit" ? " is-open" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openMenu("freq", e.currentTarget, { key: "unit" });
                    }}
                  >
                    <span className="sch-freq-ctrl-label">{trFreqValue("unit", freq.unit)}</span>
                    <Chevron />
                  </button>
                </div>
                <div className="sch-freq-row" data-freq-row="interval" hidden={freq.repeat !== "自定义"}>
                  <span className="sch-detail-label">{t("frequency.interval")}</span>
                  <button
                    type="button"
                    className={`sch-freq-ctrl${menu.kind === "freq" && menu.key === "interval" ? " is-open" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openMenu("freq", e.currentTarget, { key: "interval" });
                    }}
                  >
                    <span className="sch-freq-ctrl-label">{trFreqValue("interval", freq.interval)}</span>
                    <Chevron />
                  </button>
                </div>
                <div
                  className="sch-freq-row"
                  data-freq-row="weekday"
                  hidden={!(freq.repeat === "每周" || freq.repeat === "自定义")}
                >
                  <span className="sch-detail-label">{t("frequency.weekdayLabel")}</span>
                  <button
                    type="button"
                    className={`sch-freq-ctrl${menu.kind === "freq" && menu.key === "weekday" ? " is-open" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openMenu("freq", e.currentTarget, { key: "weekday" });
                    }}
                  >
                    <span className="sch-freq-ctrl-label">{trFreqValue("weekday", freq.weekday)}</span>
                    <Chevron />
                  </button>
                </div>
                <div
                  className="sch-freq-row"
                  data-freq-row="time"
                  hidden={
                    !(
                      freq.repeat === "每天" ||
                      freq.repeat === "工作日" ||
                      freq.repeat === "每周" ||
                      freq.repeat === "自定义"
                    )
                  }
                >
                  <span className="sch-detail-label">{t("frequency.time")}</span>
                  <button
                    type="button"
                    className={`sch-freq-ctrl${menu.kind === "freq" && menu.key === "time" ? " is-open" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openMenu("freq", e.currentTarget, { key: "time" });
                    }}
                  >
                    <span className="sch-freq-ctrl-label">{freq.time}</span>
                    <Chevron />
                  </button>
                </div>
                <div className="sch-freq-row" data-freq-row="notify">
                  <span className="sch-detail-label">{t("frequency.notify")}</span>
                  <button
                    type="button"
                    className={`sch-freq-ctrl${menu.kind === "freq" && menu.key === "notify" ? " is-open" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openMenu("freq", e.currentTarget, { key: "notify" });
                    }}
                  >
                    <span className="sch-freq-ctrl-label">{trFreqValue("notify", freq.notify)}</span>
                    <Chevron />
                  </button>
                </div>
              </div>
            </section>

            {canWrite && (
              <section className="sch-detail-section" aria-labelledby="schDetailSectionDelivery">
                <h3 className="sch-detail-section-title" id="schDetailSectionDelivery">{t("detail.delivery")}</h3>
                <div className="sch-freq-card">
                  <div className="sch-freq-row">
                    <span className="sch-detail-label">{t("detail.channel")}</span>
                    <input
                      type="text"
                      className="sch-detail-delivery-input"
                      placeholder={t("detail.channelPlaceholder")}
                      value={deliverChannel}
                      disabled={!canWrite}
                      onChange={(e) => setDeliverChannel(e.target.value)}
                    />
                  </div>
                  <div className="sch-freq-row">
                    <span className="sch-detail-label">{t("detail.chatId")}</span>
                    <input
                      type="text"
                      className="sch-detail-delivery-input"
                      placeholder={t("detail.chatIdPlaceholder")}
                      value={deliverChatId}
                      disabled={!canWrite}
                      onChange={(e) => setDeliverChatId(e.target.value)}
                    />
                  </div>
                  <div className="sch-freq-row">
                    <span className="sch-detail-label">{t("detail.sessionKey")}</span>
                    <input
                      type="text"
                      className="sch-detail-delivery-input"
                      placeholder={t("detail.sessionKeyPlaceholder")}
                      value={sourceSessionKey}
                      disabled={!canWrite}
                      onChange={(e) => setSourceSessionKey(e.target.value)}
                    />
                  </div>
                </div>
              </section>
            )}

            {authorizedSnapshot && (
              <div className="sch-detail-auth-note" style={{ fontSize: "12px", color: "#1a7f37", padding: "4px 0" }}>
                {t("detail.authorizedNote")}
              </div>
            )}

            <section className="sch-detail-section" aria-labelledby="schDetailSectionHistory">
              <h3 className="sch-detail-section-title" id="schDetailSectionHistory">{t("detail.history")}</h3>
              <div className="sch-detail-history">
                {runsLoading && <div className="sch-run-meta" style={{ padding: "4px 2px" }}>{t("detail.historyLoading")}</div>}
                {!runsLoading && (runsData?.runs?.length ?? 0) === 0 && (
                  <div className="sch-run-meta" style={{ padding: "4px 2px" }}>{t("detail.historyEmpty")}</div>
                )}
                {(runsData?.runs ?? []).map((run) => (
                  <div className="sch-run" key={`${run.ts}-${run.status}`} role="button" tabIndex={0}>
                    <div className="sch-run-icon" aria-hidden="true">
                      <PlayIcon />
                    </div>
                    <div className="sch-run-info">
                      <div className="sch-run-name">
                        {selected.name || selected.id} · {run.status}
                      </div>
                      <div className="sch-run-meta">
                        {dateTime(run.ts)}
                        {run.error ? ` · ${run.error}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {canWrite && (
              <section className="sch-detail-section">
                <button
                  type="button"
                  className="sch-create-btn"
                  style={{ alignSelf: "flex-start" }}
                  onClick={() => void toggleEnabled(selected)}
                >
                  {selected.enabled ? t("detail.togglePause") : t("detail.toggleStart")}
                </button>
                <div className="sch-detail-retention-note" style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>
                  {t("detail.retentionNote")}
                </div>
              </section>
            )}
          </div>
        </aside>
      )}

      {/* Task more menu */}
      {menu.kind === "more" && menu.anchor && menu.jobId && (
        <div
          className="sch-more-menu open"
          role="menu"
          aria-label={t("menu.more")}
          style={{
            left: Math.min(window.innerWidth - 140, Math.max(8, menu.anchor.right - 132)),
            top: Math.min(window.innerHeight - 120, menu.anchor.bottom + 6),
          }}
        >
          <button
            type="button"
            className="sch-more-item"
            role="menuitem"
            onClick={() => {
              const job = jobs.find((j) => j.id === menu.jobId);
              if (job) void trigger(job);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M10 8.5v7l6-3.5z" />
            </svg>
            {t("menu.triggerNow")}
          </button>
          <button
            type="button"
            className="sch-more-item"
            role="menuitem"
            onClick={() => {
              const job = jobs.find((j) => j.id === menu.jobId);
              if (job) void toggleEnabled(job);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
            {(jobs.find((j) => j.id === menu.jobId)?.enabled ?? true) ? t("menu.togglePause") : t("menu.toggleResume")}
          </button>
          <button
            type="button"
            className="sch-more-item danger"
            role="menuitem"
            onClick={() => {
              const job = jobs.find((j) => j.id === menu.jobId);
              closeMenus();
              if (job) setDeleteTarget(job);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
            </svg>
            {t("menu.delete")}
          </button>
        </div>
      )}

      {/* Detail more menu */}
      {menu.kind === "detailMore" && menu.anchor && selected && (
        <div
          className="sch-more-menu open"
          role="menu"
          aria-label={t("menu.more")}
          style={{
            left: Math.min(window.innerWidth - 140, Math.max(8, menu.anchor.right - 132)),
            top: Math.min(window.innerHeight - 100, menu.anchor.bottom + 6),
          }}
        >
          <button
            type="button"
            className="sch-more-item"
            role="menuitem"
            onClick={() => void trigger(selected)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M10 8.5v7l6-3.5z" />
            </svg>
            {t("menuDetail.triggerNow")}
          </button>
          <button
            type="button"
            className="sch-more-item danger"
            role="menuitem"
            onClick={() => {
              closeMenus();
              setDeleteTarget(selected);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
            </svg>
            {t("menuDetail.delete")}
          </button>
        </div>
      )}

      {/* Frequency option menu */}
      {menu.kind === "freq" && menu.anchor && menu.key && (
        <div
          className="sch-freq-menu open"
          role="menu"
          aria-label={t("frequency.label")}
          style={{
            left: Math.min(
              window.innerWidth - 160,
              Math.max(8, menu.anchor.right - 148),
            ),
            top: Math.min(window.innerHeight - 200, menu.anchor.bottom + 6),
          }}
        >
          {(menu.key === "interval"
            ? intervalsForUnit(freq.unit)
            : menu.key === "model"
              ? modelOptions
              : FREQ_OPTIONS[menu.key]
          ).map((opt) => (
            <button
              key={opt}
              type="button"
              className={`sch-freq-menu-item${freq[menu.key!] === opt ? " is-active" : ""}`}
              role="menuitem"
              onClick={() => {
                const key = menu.key!;
                closeMenus();
                void applyFreq({ [key]: opt });
              }}
            >
              <span>{trFreqValue(menu.key!, opt)}</span>
              <svg className="sch-freq-menu-check" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5 12 5 5 9-10" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* Run-in panel */}
      {menu.kind === "runin" && menu.anchor && (
        <div
          className="sch-runin-panel open"
          role="dialog"
          aria-label={t("runin.title")}
          style={{
            width: Math.min(420, window.innerWidth - 24),
            left: Math.min(
              window.innerWidth - Math.min(420, window.innerWidth - 24) - 8,
              Math.max(8, menu.anchor.right - Math.min(420, window.innerWidth - 24)),
            ),
            top: Math.min(window.innerHeight - 360, menu.anchor.bottom + 8),
          }}
        >
          <div className="sch-runin-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4 4" />
            </svg>
            <input
              type="search"
              placeholder={t("runin.search")}
              aria-label={t("runin.search")}
              value={runInQuery}
              onChange={(e) => setRunInQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="sch-runin-list">
            <button
              type="button"
              className={`sch-runin-new${runInLabel === RUNIN_NEW_KEY ? " is-active" : ""}`}
              onClick={() => {
                setRunInLabel(RUNIN_NEW_KEY);
                closeMenus();
              }}
            >
              <span className="sch-runin-new-plus">+</span>
              <span className="sch-runin-new-label">{t("runin.newChat")}</span>
              <svg className="sch-runin-check" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5 12 5 5 9-10" />
              </svg>
            </button>
            {runInQuery.trim() && (
              <div className="sch-runin-empty">{t("runin.noMatch")}</div>
            )}
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <div
          className="sch-del-overlay open"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schDeleteTitle"
          onClick={() => setDeleteTarget(null)}
        >
          <div className="sch-del-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sch-del-head">
              <h3 className="sch-del-title" id="schDeleteTitle">
                {t("delete.title", { name: deleteTarget.name || deleteTarget.id })}
              </h3>
              <button
                type="button"
                className="sch-del-close"
                aria-label={t("common:close")}
                onClick={() => setDeleteTarget(null)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 7l10 10M17 7 7 17" />
                </svg>
              </button>
            </div>
            <p className="sch-del-body">{t("delete.body")}</p>
            <div className="sch-del-foot">
              <button type="button" className="sch-del-cancel" onClick={() => setDeleteTarget(null)}>
                {t("delete.cancel")}
              </button>
              <button type="button" className="sch-del-confirm" onClick={() => void confirmDelete()}>
                {t("delete.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
