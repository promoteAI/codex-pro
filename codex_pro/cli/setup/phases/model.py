"""Model setup phase — Section 2 of the setup wizard."""
from __future__ import annotations

from typing import Any

from codex_pro.cli.setup import (
    print_info, print_success, print_warning,
    _print_section_header, _choice, _ensure_dict,
    find_provider, grouped_catalog, verify_model,
    list_models, list_model_windows,
    t_provider_label, _detect_catalog_id, _handle_verify,
    ui, t,
)
from codex_pro.cli.setup.model_verify import VerifyResult


def setup_model(config: dict) -> None:
    _print_section_header("model")
    ui.note(t("model.intro"), "info")

    groups = [
        (t(f"provider.group.{gid}"),
         [(e.id, t_provider_label(e), "") for e in entries])
        for gid, entries in grouped_catalog()
    ]
    existing = ((config.get("models", {}) or {}).get("providers") or [{}])[0]
    default_id = _detect_catalog_id(existing)
    entry_id = ui.select_grouped(t("model.select_provider"), groups, default=default_id)
    entry = find_provider(entry_id)

    api_base = entry.api_base
    if entry.needs_api_base:
        ui.note(t("model.api_base_hint"), "info")
        api_base = ui.text(t("model.api_base"), default=existing.get("apiBase", "") or api_base)

    api_key = ""
    if entry.dialect != "bedrock":
        api_key = ui.password(f"{t_provider_label(entry)} {t('model.api_key')}")
        if not api_key and existing.get("apiKey") and _detect_catalog_id(existing) == entry_id:
            api_key = existing.get("apiKey", "")

    models = []
    model_windows: dict[str, int] = {}
    if entry.models_endpoint:
        with ui.spinner(t("model.fetching")):
            models = list_models(entry, api_key, api_base)
            model_windows = list_model_windows(entry, api_key, api_base)
    if not models:
        models = list(entry.fallback_models)

    if models:
        choices = [(m, m, "") for m in models] + [("__custom__", t("model.model_custom"), "")]
        picked = ui.select(t("model.model_select"), choices, default=models[0])
        default_model = ui.text(t("model.model_name")) if picked == "__custom__" else picked
    else:
        default_model = ""
        while not default_model:
            default_model = ui.text(t("model.model_name"))

    if default_model and entry.dialect != "bedrock":
        with ui.spinner(t("model.verifying")):
            result = verify_model(entry.dialect, api_key, api_base, default_model)
        default_model, api_key = _handle_verify(result, entry, api_key, api_base, default_model)

    provider_entry: dict[str, Any] = {"name": entry.dialect}
    if api_key:
        provider_entry["apiKey"] = api_key
    if api_base:
        provider_entry["apiBase"] = api_base
    if entry.fallback_models and entry.dialect not in ("openai",):
        models_list = list(entry.fallback_models)
        if default_model and default_model not in models_list:
            models_list.append(default_model)
        provider_entry["models"] = models_list

    models_block = _ensure_dict(config, "models")
    models_block["defaultModel"] = default_model
    models_block["providers"] = [provider_entry]
    if model_windows:
        keep = set(models) | ({default_model} if default_model else set())
        captured = {mid: win for mid, win in model_windows.items() if mid in keep}
        if captured:
            existing_windows = dict(models_block.get("modelWindows") or {})
            existing_windows.update(captured)
            models_block["modelWindows"] = existing_windows

    print_success(t("model.saved", model=default_model))
