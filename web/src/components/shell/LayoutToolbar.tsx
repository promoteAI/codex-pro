import { useTranslation } from "react-i18next";
import { Maximize2, PanelBottom, PanelRight } from "lucide-react";
import { useShellStore } from "../../stores/shell";

export function LayoutToolbar({ isHome }: { isHome: boolean }) {
  const { t } = useTranslation("tools");
  const toolsOpen = useShellStore((s) => s.toolsOpen);
  const termOpen = useShellStore((s) => s.termOpen);
  const layoutMode = useShellStore((s) => s.layoutMode);
  const setLayoutMode = useShellStore((s) => s.setLayoutMode);
  const toggleTools = useShellStore((s) => s.toggleTools);
  const toggleTerm = useShellStore((s) => s.toggleTerm);

  if (!isHome) return null;

  const btn = (active: boolean) =>
    `w-7 h-7 rounded-md inline-flex items-center justify-center ${
      active
        ? "text-[#d0d0d0] shadow-[inset_0_0_0_1.5px_#3b6aef]"
        : "text-[#777] hover:bg-[#262626] hover:text-[#bbb]"
    }`;

  return (
    <div
      className="absolute top-2.5 right-3 z-[8] flex items-center gap-0.5"
      role="toolbar"
      aria-label={t("layout")}
    >
      {toolsOpen && (
        <button
          type="button"
          className={btn(layoutMode === "full")}
          title={t("full")}
          aria-label={t("full")}
          onClick={() => setLayoutMode(layoutMode === "full" ? "side" : "full")}
        >
          <Maximize2 size={16} />
        </button>
      )}
      <button
        type="button"
        className={btn(termOpen)}
        title={t("bottom")}
        aria-label={t("bottom")}
        aria-pressed={termOpen}
        onClick={toggleTerm}
      >
        <PanelBottom size={16} />
      </button>
      <button
        type="button"
        className={btn(toolsOpen)}
        title={t("side")}
        aria-label={t("side")}
        aria-pressed={toolsOpen}
        onClick={toggleTools}
      >
        <PanelRight size={16} />
      </button>
    </div>
  );
}
