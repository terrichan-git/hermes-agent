import { contrastRatio, mix } from '@hermes/shared/color'
import { describe, expect, it } from 'vitest'

import {
  BUILTIN_THEME_LIST,
  BUILTIN_THEMES,
  catppuccinTheme,
  codexTheme,
  cyberpunkTheme,
  DEFAULT_SKIN_NAME,
  DEFAULT_TYPOGRAPHY,
  emberTheme,
  EMOJI_FALLBACK,
  everforestTheme,
  githubTheme,
  midnightTheme,
  monoTheme,
  nousAltTheme,
  nousTheme,
  slateTheme,
  solarizedTheme
} from './presets'

// #40364: none of the UI text/mono fonts carry emoji glyphs, so every font
// stack must end with a color-emoji fallback or emoji render as tofu on
// platforms whose default font lacks them (e.g. Linux).
describe('theme typography emoji fallback (#40364)', () => {
  const stacks: Array<[string, string]> = [
    ['DEFAULT_TYPOGRAPHY.fontSans', DEFAULT_TYPOGRAPHY.fontSans],
    ['DEFAULT_TYPOGRAPHY.fontMono', DEFAULT_TYPOGRAPHY.fontMono],
    // A theme may override only fontMono (fontSans then falls back to the
    // default, which already carries the emoji stack), so skip undefined.
    ...BUILTIN_THEME_LIST.flatMap(theme =>
      (
        [
          [`${theme.name}.fontSans`, theme.typography?.fontSans],
          [`${theme.name}.fontMono`, theme.typography?.fontMono]
        ] as Array<[string, string | undefined]>
      ).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
  ]

  it.each(stacks)('%s includes a color-emoji font', (_label, stack) => {
    expect(stack).toMatch(/Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji|(^|,\s*)emoji\b/)
  })

  it('EMOJI_FALLBACK lists the major platform emoji fonts', () => {
    expect(EMOJI_FALLBACK).toContain('Apple Color Emoji')
    expect(EMOJI_FALLBACK).toContain('Segoe UI Emoji')
    expect(EMOJI_FALLBACK).toContain('Noto Color Emoji')
  })
})

// The pre-GitHub Nous palette stays available as nous-alt; the default name
// still means GitHub chrome + brand blue.
describe('nous-alt is the retired Nous, not the default', () => {
  it('is registered under its own name and leaves nous as the default', () => {
    expect(DEFAULT_SKIN_NAME).toBe('nous')
    expect(BUILTIN_THEMES['nous-alt']).toBe(nousAltTheme)
    expect(BUILTIN_THEMES.nous).not.toBe(nousAltTheme)
    expect(nousAltTheme.darkColors?.background).toBe('#0D2F86')
    expect(BUILTIN_THEMES.nous.darkColors?.background).not.toBe(nousAltTheme.darkColors?.background)
  })
})

// Codex is a light+dark preset whose whole point is that its *two* accent roles
// stay legible and stay distinguishable. These lock in the contrast decisions
// against a future hand-tune that "just makes the blue nicer".
describe('codex preset stays legible and monochrome', () => {
  const codex = BUILTIN_THEMES.codex

  it('is registered with both a light and a hand-tuned dark palette', () => {
    expect(codex).toBe(codexTheme)
    expect(codex.darkColors).toBeDefined()
  })

  // Regression: the pixel-measured Codex blue is #2478f0, but that is 4.18:1 on
  // white — below AA for text — and `primary` drives prose links here. The text
  // variant (#1f6ae0) must stay in place; reverting to the raw pixel value
  // re-breaks link legibility.
  it.each([
    ['light', () => codex.colors],
    ['dark', () => codex.darkColors!]
  ])('%s: primary reads AA on the canvas', (_mode, pick) => {
    const c = pick()
    expect(contrastRatio(c.primary, c.background)).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['light', () => codex.colors],
    ['dark', () => codex.darkColors!]
  ])('%s: destructive reads AA on the canvas', (_mode, pick) => {
    const c = pick()
    expect(contrastRatio(c.destructive, c.background)).toBeGreaterThanOrEqual(4.5)
  })

  // The bubble is the one token where the seed is NOT what renders: styles.css
  // mixes `--theme-bubble-seed` 45%/46% into `--theme-neutral-card`, so a naive
  // assertion on `userBubble` would pass while the visible bubble was unreadable.
  // These model the real pipeline (see --theme-mix-bubble / --theme-neutral-card).
  describe('user bubble renders readably after the seed mix', () => {
    // sRGB mix, exactly matching `color-mix(in srgb, seed N%, card)`.
    const renderedBubble = (seed: string, card: string, pct: number) => mix(card, seed, pct)

    it.each([
      ['light', '#7a7a7a', '#fcfcfc', 0.45, '#1a1c1f', 4.5],
      ['dark', '#6a6a6a', '#161618', 0.46, '#ececec', 4.5]
    ])('%s: bubble fill clears AA against its ink', (_mode, seed, card, pct, fg, min) => {
      const fill = renderedBubble(seed, card, pct)
      expect(contrastRatio(fg, fill) ?? 0).toBeGreaterThanOrEqual(min)
    })

    // The bubble must also be *distinguishable from the canvas* or it reads as
    // no bubble at all. The current nous bubble is 1.12:1 against its canvas —
    // visible only because it is tinted, not because it is far from white.
    it.each([
      ['light', '#7a7a7a', '#fcfcfc', 0.45, '#ffffff'],
      ['dark', '#6a6a6a', '#161618', 0.46, '#0d0d0d']
    ])('%s: bubble separates from the canvas', (_mode, seed, card, pct, canvas) => {
      const fill = renderedBubble(seed, card, pct)
      expect(contrastRatio(fill, canvas) ?? 0).toBeGreaterThan(1.4)
    })
  })

  // The palette is the design's contract, and it is the thing most tempting to
  // "improve" by hand. These are the measured values.
  it('holds the measured Codex neutrals', () => {
    expect(codex.colors.background).toBe('#ffffff')
    expect(codex.colors.sidebarBackground).toBe('#f0f1f1')
    expect(codex.colors.foreground).toBe('#1a1c1f')
    expect(codex.darkColors!.background).toBe('#0d0d0d')
    expect(codex.darkColors!.foreground).toBe('#ececec')
  })
})

// Authoring a theme and REGISTERING it are two separate steps, and the registry
// is the one that is easy to forget: a theme can exist, export cleanly, typecheck,
// and pass every palette test while rendering nowhere, because nothing added it to
// BUILTIN_THEMES. The picker renders `availableThemes` ← SKIN_LIST ← that map, so
// an unregistered theme is invisible with no error anywhere — and a test that
// imports the theme directly never notices, because it bypasses the registry.
describe('every shipped preset is reachable from the picker', () => {
  it.each([
    ['nous', nousTheme],
    ['github', githubTheme],
    ['catppuccin', catppuccinTheme],
    ['everforest', everforestTheme],
    ['solarized', solarizedTheme],
    ['nous-alt', nousAltTheme],
    ['codex', codexTheme],
    ['midnight', midnightTheme],
    ['ember', emberTheme],
    ['mono', monoTheme],
    ['slate', slateTheme],
    ['cyberpunk', cyberpunkTheme]
  ])('%s is registered under its own name', (name, theme) => {
    expect(theme.name).toBe(name)
    expect(BUILTIN_THEMES[name]).toBe(theme)
  })

  it('BUILTIN_THEME_LIST is exactly the registered themes', () => {
    expect(BUILTIN_THEME_LIST).toEqual(Object.values(BUILTIN_THEMES))
  })
})
