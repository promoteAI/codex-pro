#!/usr/bin/env python3
"""Generate docs/assets/architecture.png for Codex Pro README."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 2200, 2800
OUT = Path(__file__).resolve().parents[1] / "docs" / "assets" / "architecture.png"

# Palette — dark engineering board, teal accent (not purple/cream defaults)
BG = (12, 16, 24)
PANEL = (22, 28, 40)
PANEL_ALT = (26, 34, 50)
BORDER = (48, 62, 88)
BORDER_SOFT = (38, 50, 72)
TEXT = (232, 238, 248)
MUTED = (148, 162, 184)
ACCENT = (56, 189, 168)  # teal
ACCENT_DIM = (34, 120, 110)
BLUE = (96, 165, 250)
ORANGE = (251, 146, 60)
GREEN = (74, 222, 128)
YELLOW = (250, 204, 21)
PURPLE = (167, 139, 250)
CHIP_BG = (32, 42, 60)
CHIP_BORDER = (55, 72, 100)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = []
    if bold:
        candidates += [
            r"C:\Windows\Fonts\segoeuib.ttf",
            r"C:\Windows\Fonts\arialbd.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        ]
    candidates += [
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


F_TITLE = font(42, bold=True)
F_SUB = font(20)
F_PLANE = font(22, bold=True)
F_H = font(18, bold=True)
F_B = font(15)
F_S = font(13)
F_XS = font(12)


def round_rect(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    radius: int,
    fill: tuple[int, ...],
    outline: tuple[int, ...] | None = None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def center_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    text: str,
    fnt: ImageFont.ImageFont,
    fill: tuple[int, ...] = TEXT,
) -> None:
    x0, y0, x1, y1 = xy
    tw, th = text_size(draw, text, fnt)
    draw.text(((x0 + x1 - tw) / 2, (y0 + y1 - th) / 2), text, font=fnt, fill=fill)


def chip(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    label: str,
    fnt: ImageFont.ImageFont = F_S,
    fill: tuple[int, ...] = CHIP_BG,
    outline: tuple[int, ...] = CHIP_BORDER,
    text_fill: tuple[int, ...] = TEXT,
    pad_x: int = 12,
    pad_y: int = 6,
) -> int:
    tw, th = text_size(draw, label, fnt)
    w = tw + pad_x * 2
    h = th + pad_y * 2
    round_rect(draw, (x, y, x + w, y + h), 8, fill, outline, 1)
    draw.text((x + pad_x, y + pad_y - 1), label, font=fnt, fill=text_fill)
    return w


def section(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    title: str,
    accent: tuple[int, ...] = ACCENT,
) -> None:
    round_rect(draw, (x, y, x + w, y + h), 16, PANEL, BORDER, 2)
    # left accent bar
    draw.rounded_rectangle((x, y + 10, x + 6, y + h - 10), radius=3, fill=accent)
    draw.text((x + 22, y + 14), title, font=F_PLANE, fill=accent)


def card(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    title: str,
    lines: list[str] | None = None,
    accent: tuple[int, ...] = BLUE,
    status: str | None = None,
) -> None:
    round_rect(draw, (x, y, x + w, y + h), 12, PANEL_ALT, BORDER_SOFT, 1)
    draw.ellipse((x + 12, y + 16, x + 20, y + 24), fill=accent)
    draw.text((x + 28, y + 10), title, font=F_H, fill=TEXT)
    if status:
        sw, sh = text_size(draw, status, F_XS)
        sx = x + w - sw - 18
        sy = y + 12
        color = GREEN if status == "Stable" else BLUE if status == "Beta" else ORANGE
        bg = (max(color[0] // 5, 8), max(color[1] // 5, 8), max(color[2] // 5, 8))
        round_rect(draw, (sx - 8, sy - 2, sx + sw + 8, sy + sh + 4), 6, bg, color, 1)
        draw.text((sx, sy), status, font=F_XS, fill=color)
    if lines:
        yy = y + 40
        for line in lines:
            draw.text((x + 14, yy), line, font=F_S, fill=MUTED)
            yy += 20


def arrow_h(draw: ImageDraw.ImageDraw, x0: int, x1: int, y: int, color: tuple[int, ...] = BLUE) -> None:
    draw.line((x0, y, x1 - 8, y), fill=color, width=2)
    draw.polygon([(x1, y), (x1 - 10, y - 5), (x1 - 10, y + 5)], fill=color)


def arrow_v(draw: ImageDraw.ImageDraw, x: int, y0: int, y1: int, color: tuple[int, ...] = BLUE) -> None:
    draw.line((x, y0, x, y1 - 8), fill=color, width=2)
    draw.polygon([(x, y1), (x - 5, y1 - 10), (x + 5, y1 - 10)], fill=color)


def dashed_line(
    draw: ImageDraw.ImageDraw,
    xy: list[tuple[int, int]],
    color: tuple[int, ...],
    width: int = 2,
    dash: int = 8,
    gap: int = 6,
) -> None:
    for i in range(len(xy) - 1):
        x0, y0 = xy[i]
        x1, y1 = xy[i + 1]
        dx, dy = x1 - x0, y1 - y0
        length = max((dx * dx + dy * dy) ** 0.5, 1)
        ux, uy = dx / length, dy / length
        pos = 0.0
        draw_on = True
        while pos < length:
            seg = dash if draw_on else gap
            end = min(pos + seg, length)
            if draw_on:
                draw.line(
                    (x0 + ux * pos, y0 + uy * pos, x0 + ux * end, y0 + uy * end),
                    fill=color,
                    width=width,
                )
            pos = end
            draw_on = not draw_on


def main() -> None:
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Header
    draw.text((64, 48), "Codex Pro Architecture", font=F_TITLE, fill=TEXT)
    draw.text(
        (64, 104),
        "Event-Driven  ·  Channel-Agnostic AgentLoop  ·  Memory & Knowledge  ·  Safe Tool Runtime  ·  Self-Evolution",
        font=F_SUB,
        fill=MUTED,
    )

    # Legend
    lx, ly = 1380, 48
    round_rect(draw, (lx, ly, lx + 760, ly + 78), 12, PANEL, BORDER, 1)
    legend = [
        (BLUE, "Data flow"),
        (ACCENT, "Control / policy"),
        (GREEN, "Observability"),
        (ORANGE, "Evolution loop"),
    ]
    x = lx + 24
    for color, label in legend:
        draw.line((x, ly + 28, x + 28, ly + 28), fill=color, width=3)
        draw.text((x + 36, ly + 18), label, font=F_S, fill=MUTED)
        x += 175
    statuses = [(GREEN, "Stable"), (BLUE, "Beta"), (ORANGE, "Experimental")]
    x = lx + 24
    for color, label in statuses:
        draw.ellipse((x, ly + 50, x + 12, ly + 62), fill=color)
        draw.text((x + 18, ly + 46), label, font=F_XS, fill=MUTED)
        x += 130

    margin = 48
    content_w = W - margin * 2
    y = 160

    # ── 1. Interaction Plane ──────────────────────────────────────────
    plane_h = 280
    section(draw, margin, y, content_w, plane_h, "1  Interaction Plane", ACCENT)
    # Channel groups
    groups = [
        ("Developers", ["CLI", "SDK", "Web UI", "Webhook", "Cron"], BLUE),
        ("IM Bots", ["Telegram", "Discord", "Slack", "Matrix", "WhatsApp"], GREEN),
        ("China IM", ["WeChat", "WeCom", "Feishu", "DingTalk", "QQ"], ORANGE),
        ("Email", ["IMAP / SMTP", "API Email"], PURPLE),
    ]
    gx = margin + 24
    gy = y + 56
    for title, items, color in groups:
        card_w = 300
        round_rect(draw, (gx, gy, gx + card_w, gy + 120), 10, PANEL_ALT, BORDER_SOFT, 1)
        draw.text((gx + 14, gy + 10), title, font=F_H, fill=color)
        cx, cy = gx + 12, gy + 42
        for item in items:
            ww = chip(draw, cx, cy, item)
            cx += ww + 8
            if cx > gx + card_w - 80:
                cx = gx + 12
                cy += 32
        gx += card_w + 16

    # ChannelManager + Gateway
    row_y = y + 190
    card(draw, margin + 24, row_y, 720, 70, "ChannelManager", [
        "Adapter factory · Route dispatch · Lifecycle · Health · Identity mapping",
    ], ACCENT, "Stable")
    card(draw, margin + 770, row_y, 520, 70, "BaseChannel", [
        "start / stop / send  ·  capability flags  ·  stream / edit / files",
    ], BLUE)
    card(draw, margin + 1310, row_y, 790, 70, "Gateway API  (REST · WebSocket · A2A)", [
        "AuthN/Z · CORS / CSRF guard · Rate limit · Media cache · Loopback-first",
    ], PURPLE, "Stable")

    y += plane_h + 28

    # ── 2. Event Plane ────────────────────────────────────────────────
    plane_h = 150
    section(draw, margin, y, content_w, plane_h, "2  Event Plane  (MessageBus)", BLUE)
    steps = [
        "InboundEvent",
        "Async Queue",
        "Pub / Sub",
        "Idempotency",
        "Rate + Concurrency",
        "Retry + DLQ",
        "OutboundEvent",
    ]
    sx = margin + 40
    sy = y + 70
    for i, step in enumerate(steps):
        tw, th = text_size(draw, step, F_B)
        bw, bh = tw + 28, th + 20
        fill = ACCENT_DIM if i in (0, len(steps) - 1) else CHIP_BG
        outline = ACCENT if i in (0, len(steps) - 1) else CHIP_BORDER
        round_rect(draw, (sx, sy, sx + bw, sy + bh), 10, fill, outline, 2)
        center_text(draw, (sx, sy, sx + bw, sy + bh), step, F_B, TEXT)
        if i < len(steps) - 1:
            arrow_h(draw, sx + bw + 4, sx + bw + 36, sy + bh // 2, BLUE)
            sx += bw + 40
        else:
            sx += bw + 16
    draw.text(
        (margin + 40, y + 118),
        "event_schema · channel_id · user_id · session_id · thread_id · type · payload · metadata · ts",
        font=F_XS,
        fill=MUTED,
    )

    y += plane_h + 28

    # ── 3. Agent Runtime Plane ────────────────────────────────────────
    plane_h = 520
    section(draw, margin, y, content_w, plane_h, "3  Agent Runtime Plane  (AgentLoop)", ACCENT)

    # Top row helpers
    helpers = [
        ("SessionManager", ["sessions · messages", "threads · context"], BLUE),
        ("Memory Retrieval", ["Working · Episodic", "Semantic · Archival"], GREEN),
        ("Knowledge / RAG", ["hybrid BM25+FAISS", "citations · rerank"], PURPLE),
        ("ApprovalGate", ["risk classify · profiles", "manual / smart / off"], ORANGE),
    ]
    hx = margin + 24
    hy = y + 56
    for title, lines, color in helpers:
        card(draw, hx, hy, 500, 90, title, lines, color)
        hx += 520

    # Pipeline
    pipe_y = y + 170
    round_rect(draw, (margin + 24, pipe_y, margin + content_w - 24, pipe_y + 200), 12, (18, 24, 36), ACCENT_DIM, 2)
    draw.text((margin + 40, pipe_y + 12), "Pipeline: ContextStage → InferenceStage → ResponseStage", font=F_H, fill=ACCENT)

    stages = [
        ("ContextBuilder", ["System prompt", "Profile / policy", "Tool schemas", "Memory + history", "Token budget", "Spill preview"], BLUE),
        ("ModelRouter", ["Provider select", "Fallback / cooldown", "Tool calling", "Streaming tokens", "Cost attribution", "Healthy · Degraded"], GREEN),
        ("Tool Runtime", ["pre_LLM → pre_Tool", "Policy check", "ApprovalGate", "Sandbox / ShellGuard", "Credentials", "ResultNormalizer"], ORANGE),
        ("ResponseBuilder", ["Format outbound", "Token stream pub", "Compression", "Background review", "Consistency check", "Memory refresh"], PURPLE),
    ]
    sx = margin + 40
    for title, lines, color in stages:
        card(draw, sx, pipe_y + 44, 500, 140, title, lines, color)
        sx += 520

    # Bottom outputs
    outs = [
        ("ConversationCompressor", "window trim · summary"),
        ("Spill Store", "large tool output · read_spill"),
        ("Multi-Agent", "delegate · workers · A2A inbound"),
        ("Cost Tracker", "per-turn · per-provider"),
    ]
    ox = margin + 24
    oy = y + 400
    for title, sub in outs:
        round_rect(draw, (ox, oy, ox + 500, oy + 90), 10, PANEL_ALT, BORDER_SOFT, 1)
        draw.text((ox + 16, oy + 18), title, font=F_H, fill=TEXT)
        draw.text((ox + 16, oy + 50), sub, font=F_S, fill=MUTED)
        ox += 520

    y += plane_h + 28

    # ── 4. Capability Plane ───────────────────────────────────────────
    plane_h = 220
    section(draw, margin, y, content_w, plane_h, "4  Capability Plane", PURPLE)
    caps = [
        ("Tool Connectors", ["Web / File / DB / Code", "APIs · Browser sandbox", "Built-in · Custom · 3rd-party"], GREEN, "Stable"),
        ("Model Providers", ["OpenAI · Anthropic · Gemini", "DeepSeek · Qwen · Kimi · GLM", "Bedrock · OpenRouter · Ollama"], BLUE, "Beta"),
        ("Memory System", ["4-tier cognitive memory", "Decay · contradiction detect", "Consolidation pipeline"], ACCENT, "Stable"),
        ("Knowledge / RAG", ["Ingest · Embed · Retrieve", "BM25 + FAISS hybrid", "Chunk store · rerank"], PURPLE, "Stable"),
        ("Skills · Plugins · MCP", ["Skill library + evolution", "Entry-point plugins", "MCP client (OAuth)"], ORANGE, "Beta"),
    ]
    cx = margin + 24
    for title, lines, color, status in caps:
        card(draw, cx, y + 56, 400, 140, title, lines, color, status)
        cx += 420

    y += plane_h + 28

    # ── 5. Governance Plane ───────────────────────────────────────────
    plane_h = 160
    section(draw, margin, y, content_w, plane_h, "5  Governance Plane", GREEN)
    gov = [
        ("Security & Policy", ["AuthN/Z · RBAC", "ToolPolicy · Path/Net guard", "ApprovalGate profiles"], GREEN, "Stable"),
        ("Observability", ["Trace · Metrics · Logs", "Cost · Alerts · Replay", "Audit trail"], BLUE, "Stable"),
        ("Configuration", ["YAML + env", "Pydantic schema", "Feature flags"], ACCENT, "Stable"),
        ("Plugins & Hooks", ["Pre / Post hooks", "Extensions", "Custom adapters"], PURPLE, "Beta"),
    ]
    gx = margin + 24
    for title, lines, color, status in gov:
        card(draw, gx, y + 50, 510, 90, title, lines[:2], color, status)
        gx += 530

    y += plane_h + 28

    # ── 6. Evolution Loop ─────────────────────────────────────────────
    plane_h = 140
    section(draw, margin, y, content_w, plane_h, "6  Evolution & Evaluation Loop", ORANGE)
    evo = [
        "Trajectory Capture",
        "Telemetry Store",
        "Eval Suite",
        "Label / Review",
        "Candidate Skill",
        "Policy Gate",
        "Promote / Rollback",
    ]
    ex = margin + 40
    ey = y + 60
    for i, step in enumerate(evo):
        tw, _ = text_size(draw, step, F_B)
        bw = tw + 24
        round_rect(draw, (ex, ey, ex + bw, ey + 40), 10, (60, 30, 10), ORANGE, 2)
        center_text(draw, (ex, ey, ex + bw, ey + 40), step, F_B, TEXT)
        if i < len(evo) - 1:
            arrow_h(draw, ex + bw + 4, ex + bw + 28, ey + 20, ORANGE)
            ex += bw + 32
        else:
            ex += bw + 16
    draw.text(
        (margin + 40, y + 110),
        "Feeds Skills Library & Agent Runtime  ·  cooldown + one-click rollback",
        font=F_XS,
        fill=MUTED,
    )

    y += plane_h + 28

    # ── 7. Storage Layer ──────────────────────────────────────────────
    plane_h = 150
    section(draw, margin, y, content_w, plane_h, "7  Storage Layer  (local-first workspace)", MUTED)
    stores = [
        ("Conversation", "sessions · messages"),
        ("Memory", "4-tier entries"),
        ("Knowledge", "chunks · vectors"),
        ("Runtime", "cache · locks · state"),
        ("Artifacts", "files · images · spill"),
        ("Secrets", "encrypted credentials"),
        ("Telemetry", "traces · costs · logs"),
    ]
    sx = margin + 24
    sy = y + 55
    for title, sub in stores:
        round_rect(draw, (sx, sy, sx + 280, sy + 70), 10, PANEL_ALT, BORDER_SOFT, 1)
        draw.text((sx + 14, sy + 12), title, font=F_H, fill=TEXT)
        draw.text((sx + 14, sy + 40), sub, font=F_S, fill=MUTED)
        sx += 296
    draw.text(
        (margin + 24, y + 132),
        "Default: workspace filesystem  ·  Optional: Postgres · Redis · S3/OSS · Vector DB",
        font=F_XS,
        fill=MUTED,
    )

    y += plane_h + 28

    # ── 8. Bootstrap ──────────────────────────────────────────────────
    plane_h = 120
    section(draw, margin, y, content_w, plane_h, "8  Bootstrap Sequence", YELLOW)
    boot = [
        "1 Config",
        "2 Secrets",
        "3 Storage",
        "4 Providers",
        "5 Skills / Prompts",
        "6 AgentLoop",
        "7 Plugins",
        "8 Channels Ready",
    ]
    bx = margin + 40
    by = y + 55
    for i, step in enumerate(boot):
        tw, _ = text_size(draw, step, F_B)
        bw = tw + 22
        round_rect(draw, (bx, by, bx + bw, by + 36), 8, CHIP_BG, YELLOW if i == len(boot) - 1 else CHIP_BORDER, 1)
        center_text(draw, (bx, by, bx + bw, by + 36), step, F_B, TEXT)
        if i < len(boot) - 1:
            arrow_h(draw, bx + bw + 2, bx + bw + 22, by + 18, YELLOW)
            bx += bw + 26

    # Vertical flow markers on the left gutter (subtle)
    # Already encoded via numbered planes.

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes) size={img.size}")


if __name__ == "__main__":
    main()
