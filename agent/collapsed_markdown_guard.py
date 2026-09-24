"""Observed-only detector for markdown block structure collapsed onto one line.

Some provider/proxy routes intermittently deliver an assistant message whose
markdown block markers (``##``, ``|---|``, fences, ``>``, list bullets) survive
as *inline characters* while every separating newline is missing from the
content channel. The reply then renders as one run-on paragraph: block syntax is
entirely newline-delimited, so ``one.## Heading`` is not a heading, ``|---|`` is
not a table rule, and a fence never opens.

What the evidence shows (measured on this install, not inferred): the stored
text contains no newline-like character of any kind — no ``\\r``, no U+2028/29,
no zero-width or non-breaking space, and no doubled spaces at the seams. The
separators never arrived; nothing was stripped downstream. Assembly and storage
are measurably faithful (a real instrumented turn: 17 newlines in, 17 assembled,
16 after the trailing ``.strip()``), and six live probes across two routes and
four models preserved newlines, including at ~16k chars. So this is an
intermittent upstream wire-format fault at roughly the 1% level, not a
reproducible local defect.

Why a detector at all: the condition is rare, silent, and self-concealing. A
collapsed reply looks like ordinary output, so the only durable way to
characterise it is to record a positive sighting with the route and model
attached when it next occurs. This guard therefore *never* alters behaviour — it
does not retry, fall back, re-request, or rewrite the text. It logs and counts.
Correcting the formatting is not attempted because the loss is upstream and a
local "fix" would be inventing structure the provider did not send.

Blast radius is deliberately narrow: only an assistant message that is long
enough for the absence of newlines to be conclusive *and* carries block markers
that require them will classify. A genuine one-line "Done." is not a defect and
does not classify, which is also why the length floor matters more than the
marker test.

Per project policy no ``HERMES_*`` environment variable is involved; the toggle
lives in ``config.yaml`` under ``agent.collapsed_markdown_guard``.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional, Tuple

logger = logging.getLogger(__name__)

DEFAULT_GUARD_ENABLED = True

# A collapsed reply is only conclusive when there was room to have newlines. Below this
# the absence proves nothing (short answers legitimately have none), so the floor does
# the real work and the marker test only confirms.
DEFAULT_MIN_CHARS = 800

# Markers that are *block syntax*: each is inert as text unless a newline delimits it.
# Kept deliberately tight so ordinary prose that merely mentions a symbol does not trip
# the guard. Any one match is sufficient.
#
# Checked as substrings, longest/most-specific first. The heading test uses ``##`` at a
# *seam* (immediately after sentence punctuation) rather than anywhere, because ``##``
# is ordinary punctuation in prose, C-preprocessor text and shell comments.
_TABLE_RULE = "|---"
_TABLE_RULE_ALT = "| ---"
_FENCE = "```"
_BLOCKQUOTE = "> "
_BULLET_START = "- "

# ``##`` is only a heading when it opens a block: after sentence-ending punctuation
# with nothing between. On collapsed text the newline that used to precede it is gone,
# so this seam (``.``/``!``/``?``/``:``/backtick/paren then ``##``) is what remains.
_HEADING_SEAM_RE = re.compile(r"[.!?:`)\]]\s*##\s*\S")

# Attribute names on the agent object, so state survives across calls without a
# module-level global (which would leak across sessions in a long-lived gateway).
_COUNT_ATTR = "_collapsed_markdown_guard_count"
_LAST_ATTR = "_collapsed_markdown_guard_last"


def resolve_guard_settings(section: Any) -> dict:
    """Resolve ``agent.collapsed_markdown_guard`` into ``{enabled, min_chars}``.

    Malformed input falls back to the schema defaults (on, 800). Handles YAML quoting
    turning ``true``/``false`` into strings, matching the empty-response guard.
    """
    settings = {"enabled": DEFAULT_GUARD_ENABLED, "min_chars": DEFAULT_MIN_CHARS}
    if not isinstance(section, dict):
        return settings

    enabled = section.get("enabled", DEFAULT_GUARD_ENABLED)
    if isinstance(enabled, str):  # YAML quoting can turn true/false into strings.
        enabled = enabled.strip().lower() not in ("0", "false", "no", "off")
    elif not isinstance(enabled, bool):
        enabled = DEFAULT_GUARD_ENABLED
    settings["enabled"] = enabled

    raw = section.get("min_chars")
    if raw is not None and not isinstance(raw, bool):
        try:
            candidate = int(raw)
            if candidate > 0:
                settings["min_chars"] = candidate
        except (TypeError, ValueError):
            logger.debug(
                "collapsed-markdown guard: invalid min_chars %r, using default", raw
            )
    return settings


def _config(agent: Any) -> dict:
    """The resolved settings dict on the agent, or the defaults."""
    cfg = getattr(agent, "_collapsed_markdown_guard_cfg", None)
    return cfg if isinstance(cfg, dict) else {}


def _config_enabled(agent: Any) -> bool:
    """Resolve the guard toggle, defaulting ON.

    An unreadable config never disables the guard — a missing toggle must not
    silently lose the only sighting we get.
    """
    cfg = _config(agent)
    value = cfg.get(
        "enabled",
        getattr(agent, "_collapsed_markdown_guard_enabled", DEFAULT_GUARD_ENABLED),
    )
    return bool(value)


def _min_chars(agent: Any) -> int:
    cfg = _config(agent)
    try:
        return int(cfg.get("min_chars", DEFAULT_MIN_CHARS))
    except (TypeError, ValueError):
        return DEFAULT_MIN_CHARS


def detect_collapsed_markdown(
    content: Any, *, min_chars: int = DEFAULT_MIN_CHARS
) -> Optional[str]:
    """Return the marker that proves collapse, or ``None`` when the text is fine.

    Pure function: no agent, no logging, no state — so it is directly testable and
    safe to call from anywhere. Classifies only when BOTH hold:

    * the text is at least ``min_chars`` long (there was room for newlines), and
    * the text contains no real newline at all, and
    * it contains at least one markdown block marker that requires one.
    """
    if not isinstance(content, str) or not content:
        return None
    if "\n" in content or "\r" in content:
        return None
    if len(content) < max(1, int(min_chars)):
        return None

    # A block marker present with zero newlines anywhere in a long reply is the signal.
    # Ordered most-specific first so the reported label names the strongest evidence.
    if _TABLE_RULE_ALT in content or _TABLE_RULE in content:
        return "table-rule"
    if _FENCE in content:
        return "code-fence"
    if _HEADING_SEAM_RE.search(content):
        return "heading"
    # Anchor-free markers: a bullet or blockquote need only appear at a seam, which is
    # unavoidable on collapsed text, so require the leading form to avoid prose hits.
    if _BLOCKQUOTE in content or _BULLET_START in content:
        return "block-list-marker"
    return None


def note_collapsed_markdown(agent: Any, content: Any) -> Optional[str]:
    """Detect, log once per occurrence, and count. Returns the marker label or ``None``.

    Never raises: an exception inside the detector must not break message assembly,
    which is the only caller on the hot path.
    """
    try:
        if not _config_enabled(agent):
            return None
        marker = detect_collapsed_markdown(content, min_chars=_min_chars(agent))
        if marker is None:
            return None

        try:
            count = int(getattr(agent, _COUNT_ATTR, 0)) + 1
        except Exception:
            count = 1

        session_id = getattr(agent, "session_id", "") or ""
        provider = getattr(agent, "provider", "") or ""
        model = getattr(agent, "model", "") or ""
        base_url = getattr(agent, "base_url", "") or ""
        # Host only: base_url can carry a query token on some relays.
        host = base_url.split("//")[-1].split("/")[0] if base_url else ""

        setattr(agent, _COUNT_ATTR, count)
        setattr(
            agent,
            _LAST_ATTR,
            {
                "marker": marker,
                "chars": len(content),
                "session_id": session_id,
                "provider": provider,
                "model": model,
                "host": host,
            },
        )

        # One WARNING per occurrence: the point of the guard is a positive sighting.
        # Count is included so a recurring route is visible without log archaeology.
        logger.warning(
            "Collapsed markdown in assistant content: %d chars, no newlines, %s marker "
            "present (session=%s provider=%s model=%s host=%s, occurrences this session=%d). "
            "Block syntax cannot render without newlines; the separators were absent on the "
            "wire, not stripped locally. Behaviour is unchanged.",
            len(content),
            marker,
            session_id or "?",
            provider or "?",
            model or "?",
            host or "?",
            count,
        )
        return marker
    except Exception:
        # Detection is diagnostic only. Never let it affect the turn.
        logger.debug("collapsed-markdown guard failed", exc_info=True)
        return None


def collapsed_markdown_stats(agent: Any) -> dict:
    """Read the per-session sighting count and last sighting (for status surfaces/tests)."""
    return {
        "count": int(getattr(agent, _COUNT_ATTR, 0) or 0),
        "last": getattr(agent, _LAST_ATTR, None),
    }
