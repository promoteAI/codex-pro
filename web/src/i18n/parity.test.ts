import { describe, it, expect } from "vitest";
import { resources, ensureLanguage } from "./index";

// 递归收集一个 namespace 对象的所有叶子 key(点分路径)。
function leafKeys(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

// en 词条是懒加载的(入口只静态打包 zh)。顶层 await 保证在 describe 注册
// 测试之前两种语言都已注册,这样逐 namespace 的 it 才能被完整枚举。
await ensureLanguage("en");

describe("i18n 词条 zh/en key 一致性", () => {
  it("恰好含 zh 与 en 两种语言", () => {
    expect(Object.keys(resources).sort()).toEqual(["en", "zh"]);
  });

  const namespaces = new Set(
    Object.keys(resources).flatMap((l) =>
      Object.keys(resources[l] as Record<string, unknown>),
    ),
  );
  for (const ns of namespaces) {
    it(`namespace "${ns}" 的 zh/en key 集合一致`, () => {
      const zh = leafKeys((resources.zh as Record<string, unknown>)[ns]).sort();
      const en = leafKeys((resources.en as Record<string, unknown>)[ns]).sort();
      expect(en).toEqual(zh);
    });
  }
});
