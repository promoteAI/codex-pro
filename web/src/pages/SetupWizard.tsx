import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { useTranslation } from "react-i18next";

interface ProviderEntry {
  id: string;
  label: string;
  dialect: string;
  api_base: string;
  needs_api_base: boolean;
}

interface ProviderGroup {
  id: string;
  label: string;
  entries: ProviderEntry[];
}

interface SetupStatus {
  configured: boolean;
  workspace: string;
}

/**
 * First-run configuration wizard for the desktop shell.
 *
 * Loads the provider catalog from {@link /api/v1/setup/providers}, lets the
 * user pick a provider and fill in an API key / model / workspace, then writes
 * the single provider config via {@link /api/v1/setup/config}. Field names in
 * the POST body are snake_case to match the backend schema — never camelCase.
 */
export function SetupWizard() {
  const { t } = useTranslation("common");
  const [groups, setGroups] = useState<ProviderGroup[]>([]);
  const [selected, setSelected] = useState<ProviderEntry | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [model, setModel] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ groups: ProviderGroup[] }>("/setup/providers").then((d) => {
      setGroups(d.groups);
    });
    // Default workspace comes from /setup/status so the user only edits it
    // when they want a different location.
    apiFetch<SetupStatus>("/setup/status").then((s) => {
      setWorkspace(s.workspace || "");
    });
  }, []);

  async function submit() {
    setError("");
    try {
      const res = await apiFetch<{ ok: boolean }>("/setup/config", {
        method: "POST",
        body: JSON.stringify({
          provider_id: selected?.id,
          api_key: apiKey,
          api_base: apiBase || selected?.api_base,
          model,
          workspace,
        }),
      });
      if (res.ok) setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (done) {
    return (
      <div className="setup-done">
        <h1>{t("setup.done")}</h1>
        <p>{t("setup.doneHint")}</p>
      </div>
    );
  }

  return (
    <div className="setup-wizard">
      <h1>{t("setup.title")}</h1>
      <p>{t("setup.intro")}</p>
      {groups.map((g) => (
        <div key={g.id} className="provider-group">
          <h2>{g.label || t("setup.provider_group")}</h2>
          <div className="provider-grid">
            {g.entries.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelected(e)}
                className={`provider-card${selected?.id === e.id ? " is-selected" : ""}`}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {selected && (
        <div className="provider-form">
          {selected.needs_api_base && (
            <input
              placeholder={t("setup.api_base")}
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
            />
          )}
          <input
            placeholder={t("setup.api_key")}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <input
            placeholder={t("setup.model")}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <label>{t("setup.workspace")}</label>
          <input value={workspace} onChange={(e) => setWorkspace(e.target.value)} />
          <button type="button" onClick={submit}>
            {t("setup.save")}
          </button>
          {error && (
            <p role="alert" className="setup-error">
              {t("loadFailed", { error })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
