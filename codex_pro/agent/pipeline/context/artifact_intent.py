"""Artifact output-intent detection and durable continuation validation."""

from __future__ import annotations

import re
import time

ARTIFACT_CONTINUATION_VERSION = 1
ARTIFACT_CONTINUATION_TTL_SECONDS = 30 * 60

_ARTIFACT_NO_FILE_MARKERS = (
    "不要文件", "不用文件", "无需文件", "无须文件", "不要附件", "不用附件",
    "不要保存", "不用保存", "chat only", "no file", "no attachment",
    "without a file", "do not save", "don't save",
)
_ARTIFACT_CHAT_OUTPUT_RE = re.compile(
    r"(?:直接在(?:聊天|对话)|直接(?:回答|回复)|聊天里回答|"
    r"(?:answer|respond|reply)\s+(?:directly\s+)?in\s+(?:the\s+)?chat)",
    re.IGNORECASE,
)
_ARTIFACT_CHAT_NEGATION_RE = re.compile(
    r"(?:不要|别|不需|无需|(?:^|\s)do\s+not|(?:^|\s)don't|(?:^|\s)not)\s*$",
    re.IGNORECASE,
)
_ARTIFACT_HOW_TO_RE = re.compile(
    r"(?:如何|怎么|怎样|请问.{0,8}怎么).{0,20}"
    r"(?:写|撰写|生成|创建|制作|导出|保存).{0,20}"
    r"(?:报告|文档|文件|稿件)|"
    r"(?:^|\s)(?:how\s+to|how\s+(?:do|can|should)\s+i)(?:\s|$).{0,40}"
    r"(?:write|create|generate|produce|export|save).{0,30}"
    r"(?:report|document|file|manuscript)",
    re.IGNORECASE,
)
_ARTIFACT_DOC_TRANSFORM_RE = re.compile(
    # A document noun can describe the INPUT. These imperative-looking prompts
    # ask for a short chat transformation of that input, not a new file.
    r"^\s*(?:请(?:你)?|请帮我|帮我|麻烦(?:你)?)?\s*(?:写|撰写)"
    r".{0,80}(?:三|五|几|一|两|\d+)\s*(?:句话|句|段话|段|个要点)|"
    r"^\s*(?:请(?:你)?|请帮我|帮我|麻烦(?:你)?)?\s*(?:写|撰写)"
    r".{0,80}(?:总结|概括|摘要|评价|点评|回复|回答).{0,30}"
    r"(?:这份|该|下面的|以下的|上述)?(?:报告|文档|稿件)|"
    r"^\s*(?:please\s+)?(?:help\s+me\s+)?write\s+.{0,100}"
    r"(?:sentences?|paragraphs?|bullets?|summary|response|review|comments?)"
    r".{0,50}(?:this|the|following|attached)\s+(?:report|document|file)",
    re.IGNORECASE,
)
_ARTIFACT_RESUME_RE = re.compile(
    r"^\s*(?:请\s*)?(?:继续|接着做|接着来|继续做|continue|resume|go\s+on)"
    r"(?:\s*(?:吧|一下))?\s*[。.!！？?~～]*\s*$",
    re.IGNORECASE,
)
_ARTIFACT_OUTPUT_PATTERNS = tuple(re.compile(pattern, re.IGNORECASE) for pattern in (
    # Require an output/delivery verb near a document noun.  Input size and a
    # noun such as "全文" alone describe what is being *read*, not the desired
    # output medium (e.g. a 20k-character source followed by "三句话总结全文").
    r"(?:生成|输出|导出|保存|写入|创建|制作|交付|整理成|汇总成).{0,16}"
    r"(?:(?:完整|详细|审校|校对|最终)){0,3}(?:报告|文档|文件|稿件|完整稿|白皮书|说明书|全文)",
    r"(?:报告|文档|稿件|白皮书|说明书|全文).{0,16}"
    r"(?:保存|写入|输出|导出|交付|下载|作为附件|成文件)",
    r"(?:给我|提供|交付).{0,10}(?:一份|一个)?.{0,8}"
    r"(?:(?:完整|详细|审校|校对)){0,3}(?:报告|文档|文件|稿件|白皮书|说明书)",
    r"(?:generate|create|write|export|save|deliver|produce).{0,40}"
    r"(?:full |complete |detailed |proofreading )?(?:report|document|file|manuscript)",
    r"(?:report|document|file|manuscript).{0,40}"
    r"(?:as (?:an? )?(?:attachment|file)|to (?:a )?file|for download)",
    # Preserve the pre-existing terse command form without reintroducing the
    # old broad substring match.  A bare "完整报告" is an output request;
    # "请用三句话概括下面的完整报告" is not.
    r"^\s*(?:请|请给我|给我|帮我|我要|需要|要)?\s*(?:一份|一个)?\s*"
    r"(?:审校报告|校对报告|完整报告|详细报告|完整稿)\s*[。！!？?]?\s*$",
    r"^\s*(?:please\s+)?(?:a\s+)?(?:full|complete|detailed|proofreading)\s+"
    r"(?:report|document|manuscript)\s*[.!?]?\s*$",
    # Bare "写/撰写" is too common in source narration ("我写的报告") to
    # use as an unanchored output verb. Restrict it to an imperative opening.
    # The bounded span is deliberately generous: a legitimate brief often puts
    # a long subject clause between the verb and the final "完整报告" noun.
    r"^\s*(?:请(?:你)?|请帮我|帮我|麻烦(?:你)?|给我|替我|为我)?\s*"
    r"(?:写|撰写)\s*(?:一份|一个)?\s*.{0,160}"
    r"(?:报告|文档|文件|稿件|白皮书|说明书)",
    r"^\s*(?:please\s+)?(?:help\s+me\s+)?"
    r"(?:write|create|generate|produce|prepare|draft)\s+.{0,200}"
    r"(?:report|document|file|manuscript)",
))


def expects_artifact(text: str) -> bool:
    """True when the user request asks for a durable document/file artifact."""
    lower = (text or "").lower()
    if any(marker in lower for marker in _ARTIFACT_NO_FILE_MARKERS):
        return False
    # "直接在聊天回答" suppresses file output; "不要在聊天回答"
    # requests the opposite. Inspect local polarity instead of treating the
    # same substring as both meanings.
    for match in _ARTIFACT_CHAT_OUTPUT_RE.finditer(lower):
        prefix = lower[max(0, match.start() - 12):match.start()]
        if not _ARTIFACT_CHAT_NEGATION_RE.search(prefix):
            return False
    if _ARTIFACT_HOW_TO_RE.search(lower):
        return False
    if _ARTIFACT_DOC_TRANSFORM_RE.search(lower):
        return False
    return any(pattern.search(lower) for pattern in _ARTIFACT_OUTPUT_PATTERNS)


def wants_artifact_resume(text: str) -> bool:
    """Artifact recovery accepts only a bare continue command.

    General plan continuation remains slightly permissive for compatibility;
    durable artifact state is side-effecting and therefore uses this stricter
    boundary so "继续讨论股票" can never revive an old report.
    """
    return bool(_ARTIFACT_RESUME_RE.fullmatch(text or ""))


def artifact_continuation_is_live(
    state: object,
    *,
    context_key: str = "",
    now: float | None = None,
) -> bool:
    """Validate that a resume marker belongs to this conversation epoch.

    Session metadata is durable, so mere dictionary presence is not enough: an
    abandoned report could otherwise hijack an unrelated bare "continue" days
    later.  New markers are versioned, tied to the source event and reset-bounded
    context key, and expire after a short recovery window.
    """
    if not isinstance(state, dict) or state.get("version") != ARTIFACT_CONTINUATION_VERSION:
        return False
    if not str(state.get("trace_id") or "") or not str(state.get("source_event_id") or ""):
        return False
    state_context = str(state.get("context_key") or "")
    if not state_context or (context_key and state_context != context_key):
        return False
    try:
        updated_at = float(state.get("updated_at"))
    except (TypeError, ValueError):
        return False
    current = time.time() if now is None else now
    # Reject implausible future stamps as well as expired ones.  A one-minute
    # allowance avoids losing a resumable turn to tiny wall-clock adjustments.
    age = current - updated_at
    return -60.0 <= age <= ARTIFACT_CONTINUATION_TTL_SECONDS


def artifact_output_required(
    text: str,
    available_names: set[str | None],
    artifact_resume_state: object = None,
    *,
    context_key: str = "",
    now: float | None = None,
) -> bool:
    """Resolve the artifact contract from this request and resumable state."""
    artifact_flow = {
        "artifact_create", "artifact_append", "artifact_validate",
        "artifact_finalize", "artifact_deliver",
    }
    resume_artifact = wants_artifact_resume(text) and artifact_continuation_is_live(
        artifact_resume_state, context_key=context_key, now=now,
    )
    return artifact_flow.issubset(available_names) and (
        expects_artifact(text) or resume_artifact
    )
