# Color & contrast (Burnt Beats)

Tokens live in [`src/design-tokens-oklch.css`](src/design-tokens-oklch.css). **OKLCH only** for new work — no HSL, no pure gray/black.

---

## Brand hues (project-specific)

| Role | Hue | Notes |
|------|-----|--------|
| **Primary / fire** | ~**38** | Burnt orange — CTAs, ring, thermal left rim |
| **Ice accent** | ~**205** | Cyan — secondary chrome, speech/MIDI tools, right rim |
| **Neutrals** | ~**38** @ chroma **0.008–0.014** | Ember-tinted surfaces, not `chroma 0` gray |

Do **not** default to AI palette habits (hue 250 blue, hue 60 orange) unless the brand changes.

---

## OKLCH usage

`oklch(L% C H)` — lightness 0–100%, chroma ~0–0.4, hue 0–360.

- **Primary ramp:** hold hue **38**, vary **L**; reduce **C** near white/black.
- **Neutrals:** small chroma (0.008–0.015), same hue family as primary.
- **Surfaces:** `--surface-base` → `--surface-raised` → `--surface-overlay` (60% visual weight).

---

## Palette roles

| Role | Tokens | Use |
|------|--------|-----|
| Primary | `--primary-500` … `shadcn primary` | Rare accent (~10%): CTAs, focus ring |
| Neutral | `--neutral-50` … `--neutral-950` | Backgrounds, text, borders (~90%) |
| Semantic | `--success`, `--warning`, `--error`, `--info` | Status only |
| Surface | `--surface-*`, `--card`, `--popover` | Panels, modals |

Skip extra secondary/tertiary accents unless a feature needs them.

---

## 60-30-10 (visual weight)

- **~60%** neutral base (`background`, whitespace)
- **~30%** secondary text, borders, inactive UI (`muted-foreground`, `border`)
- **~10%** primary fire + ice highlights (buttons, active states)

Overusing `--primary` weakens the accent.

---

## Accessibility (WCAG)

| Content | AA | AAA target |
|---------|-----|------------|
| Body text | 4.5:1 | 7:1 |
| Large text (18px+ or 14px bold) | 3:1 | 4.5:1 |
| UI components & icons | 3:1 | 4.5:1 |

**Placeholders** use `--placeholder-foreground` (not washed-out gray on dark).

### Avoid

- Light gray on white (light mode) or low-L text on `--neutral-950`
- Gray text on saturated fills — use a darker shade of the fill hue or alpha foreground
- Red-on-green / green-on-red pairs for required distinctions (≈8% of men are red–green color blind)
- Blue on red (vibration), yellow on white, thin text on photos

---

## Tailwind / shadcn

Semantic utilities: `bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `placeholder:text-placeholder-foreground`, `border-border`, `bg-destructive`, `text-success`, etc.

Legacy CSS still reads `--text`, `--accent`, `--stem-*` — those alias OKLCH tokens in `design-tokens-oklch.css`.

---

## Related

- [`SPATIAL-DESIGN.md`](SPATIAL-DESIGN.md) — spacing, elevation, z-index

---

## Semantic migration

Bulk migration lives in [scripts/migrate-semantic-colors.mjs](scripts/migrate-semantic-colors.mjs). Run from rontend:

`ash
node scripts/migrate-semantic-colors.mjs
`

It scans src/**/*.tsx and src/**/*.css (skips pitch-tempo-plugin, demo-dist, and *.test.*) and replaces hardcoded Tailwind families with semantic tokens:

| Legacy family | Semantic token |
|---------------|----------------|
| mber-* | primary-* |
| cyan-* | info-* |
| iolet-* | ccent-midi-* |
| emerald-* | success-* |
| ose-* / ed-* | destructive-* |

Opacity helpers align with **60-30-10** visual weight: high-opacity 	ext-white/* → 	ext-secondary-foreground or 	ext-muted-foreground; g-black/* → g-chrome / g-secondary / g-muted / g-popover; low g-white/* → g-muted. Tool shell borders should use semantic accents at ~25% opacity (e.g. order-info/25, order-accent-midi/25) instead of order-info-400/10 or order-accent-midi-400/10.

Info scale aliases (--info-100 … --info-950 and matching @theme --color-info-*) bridge migrated info-* utility names to OKLCH tokens in [src/design-tokens-oklch.css](src/design-tokens-oklch.css).
