"""按需构建的触发条件。

最关键的一条：后台服务里的 gateway 绝不能卡在 pnpm build 上 —— 让 systemd 拉起的
进程停在前端构建上是不可接受的。
"""
import pytest

from codex_pro.gateway import web_build
from codex_pro.gateway.web_build import BuildOutcome, BuildReason


@pytest.fixture
def trigger(monkeypatch, tmp_path):
    """打桩构建器本体，只观察「是否被调用」。"""
    called = []
    web = tmp_path / "web"
    (web / "src").mkdir(parents=True)
    (web / "package.json").write_text("{}", encoding="utf-8")

    monkeypatch.setattr(web_build, "find_web_dir", lambda: web)
    monkeypatch.setattr(web_build, "web_build_needed", lambda d: True)
    monkeypatch.setattr(
        web_build, "build_web",
        lambda d, **kw: called.append(kw) or BuildOutcome(
            build_succeeded=True, artifact_usable=True, reason=BuildReason.OK,
        ),
    )
    monkeypatch.delenv("_CODEX_PRO_GATEWAY", raising=False)
    return called


def test_interactive_tty_builds(trigger, monkeypatch):
    monkeypatch.setattr(web_build, "_is_tty", lambda: True)
    outcome = web_build.maybe_build_web()
    assert outcome is not None
    assert len(trigger) == 1


def test_inside_the_service_process_never_builds(trigger, monkeypatch):
    """回归防线：systemd/launchd 拉起的 gateway 不得触发构建。"""
    monkeypatch.setattr(web_build, "_is_tty", lambda: True)
    monkeypatch.setenv("_CODEX_PRO_GATEWAY", "1")
    outcome = web_build.maybe_build_web()
    assert outcome is None
    assert trigger == []


def test_non_tty_never_builds(trigger, monkeypatch):
    monkeypatch.setattr(web_build, "_is_tty", lambda: False)
    outcome = web_build.maybe_build_web()
    assert outcome is None
    assert trigger == []


def test_wheel_install_is_a_noop(trigger, monkeypatch):
    monkeypatch.setattr(web_build, "_is_tty", lambda: True)
    monkeypatch.setattr(web_build, "find_web_dir", lambda: None)
    assert web_build.maybe_build_web() is None
    assert trigger == []


def test_fresh_dist_is_a_noop(trigger, monkeypatch):
    monkeypatch.setattr(web_build, "_is_tty", lambda: True)
    monkeypatch.setattr(web_build, "web_build_needed", lambda d: False)
    assert web_build.maybe_build_web() is None
    assert trigger == []


def test_explicit_interactive_override_wins(trigger, monkeypatch):
    """codex-pro web build 显式触发时不看 TTY。"""
    monkeypatch.setattr(web_build, "_is_tty", lambda: False)
    outcome = web_build.maybe_build_web(interactive=True)
    assert outcome is not None
    assert len(trigger) == 1
