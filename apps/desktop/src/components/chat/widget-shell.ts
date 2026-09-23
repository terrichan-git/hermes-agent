/**
 * Inline transcript widgets — the few tool results that render as a panel the
 * user reads or acts on (a clarify question, an artifact card) rather than as
 * a scaffold line.
 *
 * They share one shell so they cannot drift apart. They used to each pick their
 * own: clarify sat on a 2px radius over the chat backdrop's own color (a card
 * you could only see by its hairline), the artifact card on a hardcoded 10px
 * over nothing. One radius one rung above the composer, one mode-derived fill,
 * no border — the surface reads as a surface on the fill alone.
 */
export const WIDGET_SHELL_CLASS = 'rounded-3xl bg-(--ui-widget-surface-background) px-3.5 py-3'

/**
 * The clarify Q&A widget's own fill — the same tinted register as the
 * sent-prompt bubble (`--dt-user-bubble`), so a question/answer block reads as
 * part of the same "what was said" layer rather than as another tool panel.
 * Kept separate from `WIDGET_SHELL_CLASS` because an artifact card is a tool
 * result and should stay on the neutral widget fill.
 */
export const WIDGET_TINT_SHELL_CLASS = 'rounded-3xl bg-(--ui-tint-surface-background) px-3.5 py-3'
