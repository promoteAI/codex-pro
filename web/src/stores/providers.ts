import { create } from "zustand";
import { apiFetch } from "../lib/api";
import { toast } from "./toast";

export type HealthStatus = "healthy" | "degraded" | "cooldown" | "disabled" | "unknown";

export interface ProviderConfig {
  name: string;
  api_key: string;
  api_key_env: string;
  api_base: string;
  models: string[];
  extra_headers: Record<string, string>;
  max_retries: number;
  timeout_seconds: number;
  stream_include_usage: boolean;
  rate_limit_rpm: number;
}

export interface ProviderHealth {
  status: HealthStatus;
  failure_count: number;
  last_error: string;
  cooldown_until: string | null;
}

export interface ProviderEntry extends ProviderConfig {
  health?: ProviderHealth;
}

interface ProvidersState {
  providers: ProviderEntry[];
  activeName: string | null;
  loading: boolean;
  error: string | null;
  testingName: string | null;
  testResult: { ok: boolean; error: string } | null;
  fetchProviders: () => Promise<void>;
  setActive: (name: string) => void;
  addProvider: (input: Omit<ProviderConfig, "health">) => Promise<void>;
  deleteProvider: (name: string) => Promise<void>;
  testProvider: (name: string) => Promise<void>;
  refreshHealth: () => Promise<void>;
}

export const useProvidersStore = create<ProvidersState>((set, get) => ({
  providers: [],
  activeName: null,
  loading: false,
  error: null,
  testingName: null,
  testResult: null,

  fetchProviders: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<{ providers: ProviderConfig[] }>("/providers");
      const enriched: ProviderEntry[] = data.providers.map((p) => ({
        ...p,
        models: p.models ?? [],
        extra_headers: p.extra_headers ?? {},
        max_retries: p.max_retries ?? 3,
        timeout_seconds: p.timeout_seconds ?? 120,
        stream_include_usage: p.stream_include_usage ?? true,
        rate_limit_rpm: p.rate_limit_rpm ?? 0,
      }));
      set({ providers: enriched, loading: false, activeName: enriched[0]?.name ?? null });
    } catch (e: any) {
      set({ error: e.message ?? "加载失败", loading: false });
    }
  },

  setActive: (name: string) => set({ activeName: name }),

  addProvider: async (input) => {
    try {
      await apiFetch("/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      toast.success("添加成功，重启后生效");
      await get().fetchProviders();
    } catch (e: any) {
      toast.error(e.message ?? "添加失败");
      throw e;
    }
  },

  deleteProvider: async (name: string) => {
    try {
      await apiFetch(`/providers/${encodeURIComponent(name)}`, { method: "DELETE" });
      toast.success("已删除");
      await get().fetchProviders();
    } catch (e: any) {
      toast.error(e.message ?? "删除失败");
      throw e;
    }
  },

  testProvider: async (name: string) => {
    set({ testingName: name, testResult: null });
    try {
      const data = await apiFetch<{ ok: boolean; error: string }>(
        `/providers/${encodeURIComponent(name)}/test`,
        { method: "POST" },
      );
      set({ testResult: data, testingName: null });
      if (data.ok) {
        toast.success(`"${name}" 连接正常`);
      } else {
        toast.error(`"${name}" 连接失败: ${data.error}`);
      }
    } catch (e: any) {
      set({ testResult: { ok: false, error: e.message ?? "请求失败" }, testingName: null });
      toast.error(`"${name}" 请求失败: ${e.message}`);
    }
  },

  refreshHealth: async () => {
    try {
      const data = await apiFetch<{ providers: Record<string, ProviderHealth> }>("/providers/health");
      set((s) => ({
        providers: s.providers.map((p) => ({
          ...p,
          health: data.providers[p.name],
        })),
      }));
    } catch {
      // best-effort, ignore
    }
  },
}));
