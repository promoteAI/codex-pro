import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/use-api";
import { useWsSubscribe } from "../hooks/use-ws";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface TokenUsage {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

interface ChannelUsage {
  channel: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}
interface SkillUsage {
  skill: string;
  calls: number;
  successes: number;
  failures: number;
  success_rate: number;
}
interface SkillUsageResponse {
  skills: SkillUsage[];
  available: boolean;
  unavailable_reason?: string;
}

function formatUsd(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toFixed(4)}` : "-";
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

const CHANNEL_MAP: Record<string, string> = {
  api: "api",
  cli: "cli",
  cron: "cron",
  task: "task",
  websocket: "websocket",
  ws: "ws",
};

function friendlyChannel(raw: string, t: (k: string) => string): string {
  if (!raw.startsWith("gateway:")) return raw;
  const platform = raw.slice(8);
  const mapped = CHANNEL_MAP[platform];
  return mapped ? t(`channelNames.${mapped}`) : raw;
}

const CHART_TICK = { fontSize: 12, fill: "#8a8a8a" };
const GRID = "#2a2a2a";
const TOOLTIP_STYLE = {
  background: "#222",
  border: "1px solid #333",
  borderRadius: 8,
  color: "#e0e0e0",
};

export function Analytics() {
  const { t } = useTranslation(["analytics", "common"]);
  const [days, setDays] = useState(7);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const {
    data: tokens,
    error,
    refetch: refetchTokens,
  } = useApi<{ usage: TokenUsage[] }>(`/analytics/tokens?days=${days}`);
  const channelParam = selectedChannel ? `&channel=${encodeURIComponent(selectedChannel)}` : "";
  const {
    data: channels,
    error: channelsError,
    refetch: refetchChannels,
  } = useApi<{ channels: ChannelUsage[] }>(`/analytics/channels?days=${days}${channelParam}`);
  const {
    data: skills,
    error: skillsError,
    refetch: refetchSkills,
  } = useApi<SkillUsageResponse>(`/analytics/skills?days=${days}`);
  useWsSubscribe(
    ["analytics"],
    () => {
      refetchTokens();
      refetchChannels();
      refetchSkills();
    },
    ["analytics_updated"],
  );

  const usage = tokens?.usage ?? [];
  const channelRows = channels?.channels ?? [];
  const skillRows = Array.isArray(skills?.skills) ? skills.skills : [];
  const totalCost = error ? null : usage.reduce((sum, d) => sum + (d.cost_usd ?? 0), 0);
  const totalTokens = usage.reduce(
    (sum, d) => sum + (d.input_tokens ?? 0) + (d.output_tokens ?? 0),
    0,
  );
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayRow = usage.find((d) => d.date === todayKey);
  const todayTokens = (todayRow?.input_tokens ?? 0) + (todayRow?.output_tokens ?? 0);
  const skillCalls = skillRows.reduce((s, r) => s + r.calls, 0);
  const skillFails = skillRows.reduce((s, r) => s + r.failures, 0);
  const errorRate = skillCalls > 0 ? (skillFails / skillCalls) * 100 : 0;

  const channelShare = useMemo(() => {
    const total = channelRows.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
    if (total <= 0) return [];
    return channelRows
      .map((r) => ({
        name: r.channel,
        friendly: friendlyChannel(r.channel, t),
        pct: Math.round(((r.cost_usd ?? 0) / total) * 100),
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);
  }, [channelRows, t]);

  const barHeights = useMemo(() => {
    if (!usage.length) return [];
    const max = Math.max(
      ...usage.map((d) => (d.input_tokens ?? 0) + (d.output_tokens ?? 0)),
      1,
    );
    return usage.map((d) => {
      const v = (d.input_tokens ?? 0) + (d.output_tokens ?? 0);
      return {
        label: d.date.slice(5),
        pct: Math.max(8, Math.round((v / max) * 100)),
        highlight: d.date === todayKey,
      };
    });
  }, [usage, todayKey]);

  const refresh = () => {
    refetchTokens();
    refetchChannels();
    refetchSkills();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <span className="text-[12.5px] text-[#8a8a8a]">{t("timeRange")}</span>
        {[1, 7, 30].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            className={`px-3 py-1.5 rounded-lg text-[12.5px] border ${
              days === d
                ? "bg-[#2a3548] border-[#3a4a66] text-[#9eb6ff]"
                : "bg-[#1c1c1c] border-[#2e2e2e] text-[#c0c0c0] hover:bg-[#242424]"
            }`}
          >
            {d === 1 ? t("today") : t("days", { count: d })}
          </button>
        ))}
        <button
          type="button"
          onClick={refresh}
          className="px-3 py-1.5 rounded-lg text-[12.5px] bg-[#2a2a2a] border border-[#3a3a3a] text-[#d4d4d4] hover:bg-[#333]"
        >
          {t("common:refresh")}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          value={formatCompact(todayTokens || totalTokens)}
          label={t("kpiTokens")}
          hint={totalCost !== null ? t("totalCost", { cost: totalCost.toFixed(4) }) : "—"}
          hintTone="muted"
        />
        <Kpi
          value={channelRows.length ? String(channelRows.length) : "—"}
          label={t("kpiChannels")}
          hint={selectedChannel ? friendlyChannel(selectedChannel, t) : t("kpiChannelsHint")}
          hintTone="info"
        />
        <Kpi
          value={skillCalls ? String(skillCalls) : "—"}
          label={t("kpiSkillCalls")}
          hint={t("kpiSkillCallsHint", { n: skillRows.length })}
          hintTone="info"
        />
        <Kpi
          value={skillCalls ? `${errorRate.toFixed(1)}%` : "—"}
          label={t("kpiErrorRate")}
          hint={errorRate <= 5 ? t("kpiErrorOk") : t("kpiErrorWatch")}
          hintTone={errorRate <= 5 ? "ok" : "warn"}
        />
      </div>

      {error && (
        <div className="bg-[#3a1a1a] text-[#f87171] border border-[#5a2a2a] rounded-xl p-4 text-[13px]">
          {t("common:loadFailed", { error })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <div>
          <div className="text-[13px] font-medium text-[#b8b8b8] mb-2.5">
            {t("tokenTrend")} ({t("days", { count: days })})
          </div>
          <div className="bg-[#1c1c1c] border border-[#2e2e2e] rounded-xl p-4">
            {barHeights.length > 0 ? (
              <div className="flex items-end gap-2 h-[120px] mb-1">
                {barHeights.map((b) => (
                  <div key={b.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${b.pct}%`,
                        background: b.highlight ? "#3fb950" : "#1e3a5f",
                      }}
                    />
                    <span className="text-[10px] text-[#6e6e6e] truncate w-full text-center">
                      {b.label}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[120px] grid place-items-center text-[13px] text-[#6e6e6e]">
                {t("common:noData")}
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="text-[13px] font-medium text-[#b8b8b8] mb-2.5">{t("channelShare")}</div>
          <div className="bg-[#1c1c1c] border border-[#2e2e2e] rounded-xl p-4">
            {channelShare.length === 0 ? (
              <div className="text-[13px] text-[#6e6e6e] py-6 text-center">{t("common:noData")}</div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {channelShare.map((row, i) => {
                  const colors = ["#5b9dff", "#e3b341", "#3fb950"];
                  return (
                    <div key={row.name}>
                      <div className="flex justify-between text-[12px] text-[#c8c8c8] mb-1">
                        <span>{row.friendly}</span>
                        <span>{row.pct}%</span>
                      </div>
                      <div className="bg-[#2a2a2a] rounded h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded"
                          style={{ width: `${row.pct}%`, background: colors[i % colors.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <section>
        <h3 className="text-[13px] font-medium text-[#b8b8b8] mb-2.5 m-0">{t("tokenTrend")}</h3>
        <div className="bg-[#1c1c1c] border border-[#2e2e2e] rounded-xl p-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={usage}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="date" tick={CHART_TICK} stroke="#333" />
              <YAxis tick={CHART_TICK} stroke="#333" />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ color: "#a0a0a0" }} />
              <Line type="monotone" dataKey="input_tokens" stroke="#5b9dff" name={t("inputTokens")} />
              <Line type="monotone" dataKey="output_tokens" stroke="#3fb950" name={t("outputTokens")} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h3 className="text-[13px] font-medium text-[#b8b8b8] mb-2.5 m-0">{t("costTrend")}</h3>
        <div className="bg-[#1c1c1c] border border-[#2e2e2e] rounded-xl p-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={usage}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="date" tick={CHART_TICK} stroke="#333" />
              <YAxis tick={CHART_TICK} stroke="#333" unit="$" />
              <Tooltip formatter={formatUsd} contentStyle={TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="cost_usd" stroke="#e3b341" name={t("costUsd")} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h3 className="text-[13px] font-medium text-[#b8b8b8] mb-2.5 m-0">{t("channelAttribution")}</h3>
        <div className="bg-[#1c1c1c] border border-[#2e2e2e] rounded-xl p-4 h-64">
          {channelsError ? (
            <div className="text-[13px] text-[#f87171]">{t("common:loadFailed", { error: channelsError })}</div>
          ) : channelRows.length === 0 ? (
            <div className="text-[13px] text-[#6e6e6e]">{t("common:noData")}</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height="85%">
                <BarChart data={channelRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis
                    dataKey="channel"
                    tick={CHART_TICK}
                    stroke="#333"
                    tickFormatter={(v: string) => friendlyChannel(v, t)}
                  />
                  <YAxis tick={CHART_TICK} stroke="#333" unit="$" />
                  <Tooltip formatter={formatUsd} contentStyle={TOOLTIP_STYLE} />
                  <Bar
                    dataKey="cost_usd"
                    fill={selectedChannel ? "#6366f1" : "#5b9dff"}
                    name={t("costUsd")}
                    onClick={(e) => {
                      if (e && typeof e === "object" && "payload" in e) {
                        const ch = (e as { payload?: { channel?: string } }).payload?.channel;
                        if (ch) setSelectedChannel(selectedChannel === ch ? null : ch);
                      }
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
              {selectedChannel && (
                <button
                  type="button"
                  onClick={() => setSelectedChannel(null)}
                  className="mt-2 text-[12px] text-[#4c8dff] hover:underline"
                >
                  {t("clearChannelFilter")}
                </button>
              )}
            </>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-[13px] font-medium text-[#b8b8b8] mb-2.5 m-0">{t("skillUsage")}</h3>
        <div className="bg-[#1c1c1c] border border-[#2e2e2e] rounded-xl overflow-x-auto">
          {skillsError ? (
            <div className="p-4 text-[13px] text-[#f87171]">{t("common:loadFailed", { error: skillsError })}</div>
          ) : skills?.available === false ? (
            <div className="p-4 text-[13px] text-[#e3b341]">{t("skillUnavailable")}</div>
          ) : skillRows.length === 0 ? (
            <div className="p-4 text-[13px] text-[#6e6e6e]">{t("common:noData")}</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-[#222] text-[#8a8a8a]">
                <tr>
                  <th className="text-left p-3 font-medium">{t("skill")}</th>
                  <th className="text-right p-3 font-medium">{t("calls")}</th>
                  <th className="text-right p-3 font-medium">{t("successes")}</th>
                  <th className="text-right p-3 font-medium">{t("failures")}</th>
                  <th className="text-right p-3 font-medium">{t("successRate")}</th>
                </tr>
              </thead>
              <tbody>
                {skillRows.map((row) => (
                  <tr key={row.skill} className="border-t border-[#2a2a2a]">
                    <td className="p-3 font-medium text-[#e8e8e8]">{row.skill}</td>
                    <td className="p-3 text-right tabular-nums text-[#c8c8c8]">{row.calls}</td>
                    <td className="p-3 text-right text-[#3fb950] tabular-nums">{row.successes}</td>
                    <td className="p-3 text-right text-[#f87171] tabular-nums">{row.failures}</td>
                    <td className="p-3 text-right tabular-nums text-[#c8c8c8]">
                      {(row.success_rate * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  value,
  label,
  hint,
  hintTone,
}: {
  value: string;
  label: string;
  hint: string;
  hintTone: "ok" | "info" | "warn" | "muted";
}) {
  const tone =
    hintTone === "ok"
      ? "text-[#3fb950]"
      : hintTone === "info"
        ? "text-[#8eb6ff]"
        : hintTone === "warn"
          ? "text-[#e3b341]"
          : "text-[#6e6e6e]";
  return (
    <div className="bg-[#1c1c1c] border border-[#2e2e2e] rounded-xl text-center px-3 py-4">
      <div className="text-[22px] font-semibold text-[#e0e0e0]">{value}</div>
      <div className="text-[11.5px] text-[#6e6e6e] mt-0.5">{label}</div>
      <div className={`text-[11px] mt-1 ${tone}`}>{hint}</div>
    </div>
  );
}
