import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";
import i18n from "../i18n";

// jsdom 不实现元素的 scrollIntoView；ChatThread 依赖它平滑滚动到底部。
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// 每个测试前重置到 zh,避免切换语言的测试相互污染。
beforeEach(async () => {
  await i18n.changeLanguage("zh");
});
