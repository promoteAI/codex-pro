/**
 * Shared brand-color mapping for plugin/skill chips.
 *
 * These are third-party product brand colors (Google, Figma, Notion, Slack,
 * etc.) used as fallback chip backgrounds when a plugin ships no icon of its
 * own. They are intentionally NOT theme tokens — they represent external
 * brands and must stay constant across dark/light themes.
 *
 * Extracted from the duplicated `PLUGIN_COLOR` / `PLUGIN_CHIP_COLOR_FOR`
 * helpers that previously lived in both `ComposerAddMenu.tsx` and
 * `PluginsView.tsx`.
 */

/** Fallback chip color for a plugin that ships no icon of its own. */
export function pluginColor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("computer") || lower.includes("use")) return "#1b5e20";
  if (lower.includes("sheet")) return "#0f9d58";
  if (lower.includes("present")) return "#f4b400";
  if (lower.includes("doc") || lower.includes("document")) return "#4285f4";
  if (lower.includes("pdf")) return "#ea4335";
  if (lower.includes("figma")) return "#7c4dff";
  if (lower.includes("notion")) return "#00c853";
  if (lower.includes("linear")) return "#ff6d00";
  if (lower.includes("slack")) return "#0091ea";
  if (lower.includes("jira")) return "#c2185b";
  if (lower.includes("terminal")) return "#455a64";
  if (lower.includes("browser")) return "#6a1b9a";
  if (lower.includes("github") || lower.includes("git")) return "#24292f";
  if (lower.includes("automate")) return "#5b8def";
  if (lower.includes("canvas")) return "#7c5cff";
  if (lower.includes("hook")) return "#fb7185";
  if (lower.includes("rule")) return "#fbbf24";
  if (lower.includes("skill")) return "#c084fc";
  if (lower.includes("agent") || lower.includes("subagent")) return "#67e8f9";
  if (lower.includes("design")) return "#a78bfa";
  if (lower.includes("file")) return "#818cf8";
  return "#6e6e6e";
}
