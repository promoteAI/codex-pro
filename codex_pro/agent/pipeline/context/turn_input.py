"""Turn input normalization: resume intent, deictic query, reply quoting."""

from __future__ import annotations

import re
from typing import Any

from codex_pro.bus.events import InboundEvent

_REPLY_SNIPPET_MAX = 500  # 被引用原文注入上限，过长截断，避免撑爆上下文

# 「继续上一个任务」的意图标记。刻意保守:只有当用户消息基本只包含继续指令
# (≤12 字符)时才续跑旧计划——一条新的完整问题即使包含"继续"一词,也应视为
# 新任务走 create_plan。宁可漏续(用户可再说一次"继续"),不可错续。
_RESUME_MARKERS = ("继续", "接着做", "接着来", "继续做", "continue", "resume", "go on")

_DEICTIC_RE = re.compile(
    r"(上述|上面|前面|刚才|刚刚|这些|该项|照这个|按这个|"
    r"逐项|继续|接着|\babove\b|\bprevious\b|\bthose\b|\bcontinue\b|\bresume\b)",
    re.IGNORECASE,
)


def wants_resume(text: str) -> bool:
    """True when the user's message is essentially a bare continue command."""
    stripped = (text or "").strip().strip("。.!！~～ ")
    if not stripped or len(stripped) > 12:
        return False
    lowered = stripped.lower()
    return any(lowered.startswith(m) for m in _RESUME_MARKERS)


def _message_text(message: dict[str, Any]) -> str:
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            str(part.get("text", ""))
            for part in content
            if isinstance(part, dict) and part.get("type") == "text"
        )
    return str(content or "")


def contextual_retrieval_query(text: str, history: list[dict[str, Any]]) -> str:
    """Resolve deictic search terms from the immediate conversation.

    Queries like "apply the above changes" are nearly content-free on their
    own. Sending that text directly to long-term retrieval lets an unrelated
    old checklist become the strongest lexical match. For such turns only,
    append the recent human-visible exchange to the retrieval query; ordinary
    self-contained requests keep their historical behaviour and cost.
    """
    current = (text or "").strip()
    if not current or not _DEICTIC_RE.search(current):
        return current
    recent: list[str] = []
    for message in reversed(history):
        role = message.get("role")
        if role not in {"user", "assistant"} or message.get("tool_calls"):
            continue
        body = _message_text(message).strip()
        if body:
            recent.append(f"{role}: {body[-800:]}")
        if len(recent) >= 4:
            break
    if not recent:
        return current
    recent.reverse()
    return f"{' '.join(recent)} current user: {current}"[-2400:]


def planning_context(history: list[dict[str, Any]], retrieval: str) -> str:
    """Build planner context with conversation/recalled-data provenance.

    A configured PLAN_EXECUTE strategy runs a separate model call that does not
    otherwise see chat history. Passing only retrieval made it capable of
    resolving "the above" against old memory and injecting that stale plan into
    the real inference turn.
    """
    recent: list[str] = []
    for message in reversed(history):
        role = message.get("role")
        if role not in {"user", "assistant"} or message.get("tool_calls"):
            continue
        body = _message_text(message).strip()
        if body:
            recent.append(f"{role}: {body[-1000:]}")
        if len(recent) >= 4:
            break
    recent.reverse()
    parts: list[str] = []
    if recent:
        parts.append(
            "Recent conversation (authoritative for references such as "
            "'above' and 'continue'):\n" + "\n".join(recent)
        )
    if retrieval:
        parts.append(
            "Recalled background (may be stale; never redefine the active task):\n"
            + retrieval[:2000]
        )
    return "\n\n".join(parts)


def build_user_message_with_reply(event: InboundEvent) -> str:
    """构造写入会话历史的用户消息文本，把被引用消息原文作为前缀注入。

    跨通道统一的「理解层」：让模型知道用户在针对历史里哪一条消息发问（消歧），
    而不是只看到用户这次的新文字。无被引用原文时原样返回 event.text，不注入。
    注意只影响写入历史的副本，不改 event.text（检索/压缩仍用原始问题）。
    """
    reply_text = (event.reply_to_text or "").strip()
    if not reply_text:
        return event.text
    snippet = reply_text[:_REPLY_SNIPPET_MAX]
    if event.reply_to_is_own:
        prefix = f'[回复你刚才的消息: "{snippet}"]'
    elif event.reply_to_sender:
        prefix = f'[引用 {event.reply_to_sender}: "{snippet}"]'
    else:
        prefix = f'[引用: "{snippet}"]'
    return f"{prefix}\n\n{event.text}" if event.text else prefix
