"""Tests for the observed-only collapsed-markdown guard.

The guard is diagnostic: it must detect the real failure shape, never alter the
text, and never fire on a legitimate reply. The false-positive sweep is the
load-bearing test — this detector runs on every assistant message, so a noisy
classifier would be worse than no classifier.
"""

from __future__ import annotations

import logging
import types

import pytest

from agent.collapsed_markdown_guard import (
    DEFAULT_MIN_CHARS,
    collapsed_markdown_stats,
    detect_collapsed_markdown,
    note_collapsed_markdown,
    resolve_guard_settings,
)

# ── Real failure shapes ──────────────────────────────────────────────────────
# Condensed from this install's state.db (ids 68987 / 69113 / 65412), preserving the
# exact collapse shape: markdown block markers present, every newline absent. Each is
# padded above the length floor with more of the same prose so the floor is exercised
# honestly rather than bypassed.
_PAD = (
    "The rest of the analysis continues in the same register, describing the token system, "
    "the enforcement path, and the measured difference between the two libraries. "
)

REAL_TABLE = (
    "I dug into the OD repo. The answer reframes the question: **OpenDesign already is Refero** "
    "you're not integrating two tools, you're holding two copies of one.## OD vendored Refero already "
    "`~/dev/open-design/craft/README.md`, verbatim:> Craft content is adapted from the MIT-licensed "
    "*refero_skill* project.| Layer | Count | Owns | Authority ||---|---|---|---|| OD `craft/` | 12 files "
    "| Universal craft rules | **Enforced** || Refero skill | 10 files | Research method | Advisory prose only |"
    "That last row is the whole answer. **OD's craft is shorter but enforced; Refero's is fuller but inert.**"
) + (_PAD * 2)

# id=69113: code fence collapsed, headings welded to prose
REAL_FENCE = (
    "Found it and this time I have a **definitive, in-codebase proof** rather than a theory.## Root cause "
    "My handler did this:```jsfunction onScroll() { el.classList.add('sticky') }``` "
    "The fix is to compare the animation, not the sticky-follow viewport.scrollTop assignment, and then "
    "re-measure after the transform settles, because the compositor updates on the next frame.## The fix "
    "Use a ResizeObserver instead of listening to scroll.```jsnew ResizeObserver(update).observe(el)``` "
    "That removes the feedback loop entirely and is what the docs recommend for this exact case."
) + (_PAD * 2)

# id=65412: fence collapsed, heading butting straight onto prose
REAL_FENCE_2 = (
    "**Stop, the full list changes the conclusion again, and this time in the model's favour.**"
    "## The `ops` class isn't a class, it's a mislabelled bucket"
    "Look at what's actually filed under `source: ops` in the ledger:```yaml- name: sweep "
    "  source: ops  cadence: daily```So the file is tagged as an operational task even though the work "
    "is a research pass, which is why it kept getting scheduled twice and why the results looked duplicated."
) + (_PAD * 3)


# ── Detection: true positives ────────────────────────────────────────────────
@pytest.mark.parametrize(
    "name,text,expected",
    [
        ("real table collapse", REAL_TABLE, "table-rule"),
        ("real fence collapse", REAL_FENCE, "code-fence"),
        ("second fence collapse", REAL_FENCE_2, "code-fence"),
    ],
)
def test_detects_real_collapses(name, text, expected):
    assert "\n" not in text, "fixture must be collapsed to exercise the guard"
    assert detect_collapsed_markdown(text) == expected, name


def test_table_rule_wins_over_heading_when_both_present():
    """Label names the strongest evidence, so a table rule beats a heading seam."""
    text = (
        "Intro prose that runs on for a while so the length floor is cleared comfortably."
        "## A Heading`https://example.com/a/b/c`| a | b ||---|---|| 1 | 2 |"
        "More trailing prose to keep it above the minimum character threshold for the guard."
    ) + (_PAD * 4)
    assert len(text) >= DEFAULT_MIN_CHARS
    assert detect_collapsed_markdown(text) == "table-rule"


def test_detects_heading_seam_without_table_or_fence():
    text = (
        "Some prose that is long enough to clear the character floor for this detector, comfortably."
        "## Section One`https://example.com/path`then more prose follows here to pad the length out "
        "so that this clearly had room to contain newlines but does not contain any at all."
    ) + (_PAD * 4)
    assert len(text) >= DEFAULT_MIN_CHARS
    assert detect_collapsed_markdown(text) == "heading"


def test_detects_block_list_marker():
    text = (
        "Prose introducing a list that runs on without any break at all in the middle of it here."
        "- first item that is described at length so the whole thing clears the floor easily "
        "- second item also described at length to pad the total character count up above the minimum"
    ) + (_PAD * 4)
    assert len(text) >= DEFAULT_MIN_CHARS
    assert detect_collapsed_markdown(text) == "block-list-marker"


# ── Detection: must NOT fire ─────────────────────────────────────────────────
def test_clean_markdown_is_not_flagged():
    """Correctly formatted markdown is never a collapse — newlines short-circuit."""
    assert (
        detect_collapsed_markdown(
            "Intro para.\n\n## Heading\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nx()\n```\n"
        )
        is None
    )


def test_short_single_line_reply_is_not_flagged():
    assert detect_collapsed_markdown("Done.") is None
    assert detect_collapsed_markdown("Yes, that's right.") is None


def test_long_prose_without_block_markers_is_not_flagged():
    """A long reply that has no block syntax has nothing to collapse."""
    text = "This is a long paragraph of ordinary prose. " * 40
    assert len(text) >= DEFAULT_MIN_CHARS
    assert detect_collapsed_markdown(text) is None


def test_prose_mentioning_hashes_is_not_flagged():
    """'##' is ordinary punctuation in prose; only a heading SEAM counts."""
    text = (
        "The C preprocessor uses ## for token pasting and # for stringification, which trips people up. "
        "In shell, # starts a comment. None of that is markdown syntax, so it must not classify. "
    ) * 6
    assert len(text) >= DEFAULT_MIN_CHARS
    assert detect_collapsed_markdown(text) is None


def test_just_below_floor_is_not_flagged():
    text = "## H" + ("x" * (DEFAULT_MIN_CHARS - 10))
    assert len(text) < DEFAULT_MIN_CHARS
    assert detect_collapsed_markdown(text) is None


def test_json_payload_is_not_flagged():
    """Tool-ish JSON content is not markdown and must not classify (real case: ids 56861/56891)."""
    text = (
        '{"file_path": "/tmp/a.md", "summary": "'
        + ("research pack written and verified. " * 50)
        + '"}'
    )
    assert len(text) >= DEFAULT_MIN_CHARS
    assert detect_collapsed_markdown(text) is None


# ── Input robustness ─────────────────────────────────────────────────────────
@pytest.mark.parametrize("value", [None, "", 0, [], {}, b"bytes", "short"])
def test_non_text_and_short_inputs_never_raise(value):
    assert detect_collapsed_markdown(value) is None


def test_crlf_counts_as_a_newline():
    assert detect_collapsed_markdown(("x" * 900) + "\r\n") is None


def test_min_chars_override_is_honoured():
    text = "short.## H"
    assert detect_collapsed_markdown(text, min_chars=5) == "heading"
    assert detect_collapsed_markdown(text, min_chars=500) is None


# ── note_* : logging + state, never raising ──────────────────────────────────
def _fake_agent(**over):
    base = dict(
        session_id="sess-1",
        provider="custom",
        model="deepseek-v4.1-flash",
        base_url="https://prod.grouter.web.id/v1",
    )
    base.update(over)
    return types.SimpleNamespace(**base)


def test_note_logs_one_warning_with_route_attribution(caplog):
    agent = _fake_agent()
    with caplog.at_level(logging.WARNING, logger="agent.collapsed_markdown_guard"):
        marker = note_collapsed_markdown(agent, REAL_TABLE)
    assert marker == "table-rule"
    assert len(caplog.records) == 1
    msg = caplog.records[0].getMessage()
    # Route attribution is the whole point of the guard.
    for expected in (
        "sess-1",
        "custom",
        "deepseek-v4.1-flash",
        "prod.grouter.web.id",
        "table-rule",
    ):
        assert expected in msg, expected


def test_note_does_not_modify_content():
    agent = _fake_agent()
    original = REAL_TABLE
    copy = str(original)
    note_collapsed_markdown(agent, original)
    assert original == copy, "the guard must be read-only on message content"


def test_note_counts_occurrences_per_agent():
    agent = _fake_agent()
    note_collapsed_markdown(agent, REAL_TABLE)
    note_collapsed_markdown(agent, REAL_FENCE)
    assert collapsed_markdown_stats(agent)["count"] == 2


def test_note_records_last_sighting_detail():
    agent = _fake_agent()
    note_collapsed_markdown(agent, REAL_FENCE)
    last = collapsed_markdown_stats(agent)["last"]
    assert last["marker"] == "code-fence"
    assert last["chars"] == len(REAL_FENCE)
    assert last["host"] == "prod.grouter.web.id"


def test_note_returns_none_and_logs_nothing_on_clean_text(caplog):
    agent = _fake_agent()
    with caplog.at_level(logging.WARNING, logger="agent.collapsed_markdown_guard"):
        assert note_collapsed_markdown(agent, "Intro.\n\n## H\n\nfine.\n") is None
    assert caplog.records == []
    assert collapsed_markdown_stats(agent)["count"] == 0


def test_guard_disabled_via_config():
    agent = _fake_agent()
    agent._collapsed_markdown_guard_cfg = {"enabled": False}
    assert note_collapsed_markdown(agent, REAL_TABLE) is None


def test_guard_enabled_by_default_when_config_absent():
    agent = _fake_agent()
    assert note_collapsed_markdown(agent, REAL_TABLE) == "table-rule"


def test_bad_config_min_chars_falls_back_to_default():
    agent = _fake_agent()
    agent._collapsed_markdown_guard_cfg = {"min_chars": "not-an-int"}
    # Falls back to the default floor, so a short collapse still does not classify.
    assert note_collapsed_markdown(agent, "short.## H") is None


def test_note_never_raises_on_hostile_agent():
    class Exploding:
        @property
        def session_id(self):
            raise RuntimeError("boom")

    # Must swallow and return None rather than break message assembly.
    assert note_collapsed_markdown(Exploding(), REAL_TABLE) is None


def test_missing_route_fields_do_not_raise(caplog):
    agent = types.SimpleNamespace()  # no session/provider/model/base_url at all
    with caplog.at_level(logging.WARNING, logger="agent.collapsed_markdown_guard"):
        assert note_collapsed_markdown(agent, REAL_TABLE) == "table-rule"
    assert len(caplog.records) == 1


# ── resolve_guard_settings: config plumbing ──────────────────────────────────
def test_resolve_defaults_on_missing_section():
    assert resolve_guard_settings(None) == {
        "enabled": True,
        "min_chars": DEFAULT_MIN_CHARS,
    }
    assert resolve_guard_settings("nonsense") == {
        "enabled": True,
        "min_chars": DEFAULT_MIN_CHARS,
    }
    assert resolve_guard_settings({}) == {
        "enabled": True,
        "min_chars": DEFAULT_MIN_CHARS,
    }


def test_resolve_reads_enabled_and_min_chars():
    assert resolve_guard_settings({"enabled": False, "min_chars": 2000}) == {
        "enabled": False,
        "min_chars": 2000,
    }


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("false", False),
        ("False", False),
        ("no", False),
        ("off", False),
        ("0", False),
        ("true", True),
        ("yes", True),
        ("on", True),
    ],
)
def test_resolve_handles_yaml_string_booleans(raw, expected):
    """YAML quoting can turn true/false into strings."""
    assert resolve_guard_settings({"enabled": raw})["enabled"] is expected


@pytest.mark.parametrize("bad", [0, -5, "abc", None, 3.7, [], {}])
def test_resolve_falls_back_on_bad_min_chars(bad):
    got = resolve_guard_settings({"min_chars": bad})["min_chars"]
    if bad == 3.7:
        assert got == 3  # int() truncates a float; acceptable, still positive
    else:
        assert got == DEFAULT_MIN_CHARS


def test_resolve_ignores_bool_min_chars():
    """bool is an int subclass; True must not become min_chars=1."""
    assert resolve_guard_settings({"min_chars": True})["min_chars"] == DEFAULT_MIN_CHARS


def test_note_honours_resolved_config_min_chars():
    """A lowered floor must actually widen detection end-to-end."""
    agent = _fake_agent()
    agent._collapsed_markdown_guard_cfg = resolve_guard_settings({"min_chars": 20})
    text = (
        "short prose.## H here"  # 21 chars: above the lowered floor, below the default
    )
    assert 20 <= len(text) < DEFAULT_MIN_CHARS
    assert note_collapsed_markdown(agent, text) == "heading"
    # And the same text is ignored at the default floor.
    assert note_collapsed_markdown(_fake_agent(), text) is None


def test_note_honours_resolved_config_disabled():
    agent = _fake_agent()
    agent._collapsed_markdown_guard_cfg = resolve_guard_settings({"enabled": False})
    assert note_collapsed_markdown(agent, REAL_TABLE) is None
