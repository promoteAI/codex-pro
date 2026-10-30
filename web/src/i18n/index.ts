import i18n, { type Resource } from "i18next";
import { initReactI18next } from "react-i18next";

// 词条按语言拆分加载:默认语言 zh 静态打包(首屏与测试同步可用),其余语言
// 通过 Vite 懒加载 glob 按需拉取。双语全量打包曾占入口 chunk 约 54 KiB
// (raw),而绝大多数用户只使用一种语言。
const eagerModules = import.meta.glob("./locales/zh/*.json", { eager: true });
const lazyModules = import.meta.glob("./locales/*/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

export const resources: Record<string, Record<string, unknown>> = {};
for (const [path, mod] of Object.entries(eagerModules)) {
  const m = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!m) continue;
  const [, lng, ns] = m;
  (resources[lng] ??= {})[ns] = (mod as { default: unknown }).default;
}

/** Languages whose bundles are already registered (zh eagerly, others once
 *  ensureLanguage has resolved). Guards against duplicate addResourceBundle
 *  work when changeLanguage is called repeatedly for the same language. */
const loadedLanguages = new Set<string>(["zh"]);

/** Register every namespace of `lng` by lazy-importing its JSON modules.
 *  Idempotent; resolves immediately for zh or an unknown language code. */
export async function ensureLanguage(lng: string): Promise<void> {
  if (loadedLanguages.has(lng)) return;
  loadedLanguages.add(lng);
  await Promise.all(
    Object.entries(lazyModules).map(async ([path, load]) => {
      const m = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
      if (!m || m[1] !== lng) return;
      const mod = await load();
      i18n.addResourceBundle(lng, m[2], mod.default as Resource, true, true);
    }),
  );
}

const SUPPORTED = ["zh", "en"] as const;
const LANG_STORAGE_KEY = "codex_lang";

/** Detect the UI language: persisted choice first, then the browser's.
 *  Inlined in place of i18next-browser-languagedetector — the plugin cost
 *  ~14 KiB of entry-chunk source for logic this small. */
function detectLanguage(): string {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && (SUPPORTED as readonly string[]).includes(stored)) return stored;
  } catch {
    /* storage unavailable (privacy mode) — fall through to navigator */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  return nav.toLowerCase().startsWith("zh") ? "zh" : "en";
}

i18n
  .use(initReactI18next)
  .init({
    resources: resources as Resource,
    lng: detectLanguage(),
    fallbackLng: "zh",
    supportedLngs: SUPPORTED as unknown as string[],
    defaultNS: "common",
    interpolation: { escapeValue: false },
  });

// Wrap changeLanguage so every caller — the settings dropdown, tests, startup —
// transparently awaits the target language's lazy bundles before the switch,
// and so the choice persists the way the detector plugin used to cache it.
// Without the await, switching to a not-yet-loaded language renders raw keys
// until the import lands.
const rawChangeLanguage = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = async (
  lng?: string | readonly string[],
  ...rest: unknown[]
) => {
  const target = Array.isArray(lng) ? lng[0] : lng;
  if (target) {
    await ensureLanguage(target);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, target);
    } catch {
      /* non-fatal: language still applies for this session */
    }
  }
  return (rawChangeLanguage as (...args: unknown[]) => Promise<unknown>)(
    lng,
    ...rest,
  ) as ReturnType<typeof i18n.changeLanguage>;
};

// 同步 <html lang>,利于无障碍;切换语言时更新。
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.resolvedLanguage ?? "zh";

export default i18n;
