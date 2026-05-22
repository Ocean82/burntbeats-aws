# Spatial design (Burnt Beats frontend)

Canonical spacing, elevation, and layout rules for the Vite/React app. Tokens live in `src/index.css` (`:root` + `@theme`).

---

## Spacing system

**Use a 4pt base, not 8pt.** An 8pt-only scale skips values you need often (e.g. 12px between 8 and 16).

| Token | px | Tailwind utility |
|-------|-----|------------------|
| `--space-2xs` | 4 | `gap-2xs`, `p-2xs`, … |
| `--space-xs` | 8 | `gap-xs`, … |
| `--space-sm` | 12 | `gap-sm`, … |
| `--space-md` | 16 | `gap-md`, … |
| `--space-lg` | 24 | `gap-lg`, … |
| `--space-xl` | 32 | `gap-xl`, … |
| `--space-2xl` | 48 | `gap-2xl`, … |
| `--space-3xl` | 64 | `gap-3xl`, … |
| `--space-4xl` | 96 | `gap-4xl`, … |

**Name by relationship, not pixel value:** `--space-sm`, not `--spacing-8`.

**Prefer `gap` over margins** for sibling spacing (no margin collapse, less cleanup). Utility stacks: `.stack-md`, `.inline-cluster-sm`.

**Avoid:** arbitrary px outside the scale; making all spacing equal (variety drives hierarchy).

---

## Grid

**Self-adjusting grid** (no breakpoint grid for simple card lists):

```html
<div class="auto-grid">…</div>
```

Equivalent: `repeat(auto-fit, minmax(280px, 1fr))`.

For page-level regions, use viewport breakpoints + named `grid-template-areas` when layouts are complex.

---

## Visual hierarchy

Do not rely on size alone. Combine 2–3 dimensions:

| Tool | Strong | Weak |
|------|--------|------|
| Size | ≥3:1 ratio | &lt;2:1 |
| Weight | Bold vs regular | Medium vs regular |
| Color | High contrast | Similar tones |
| Position | Top / start | Bottom / end |
| Space | Generous whitespace | Crowded |

---

## Cards

Cards are optional. Group with spacing, alignment, and typography first. Use cards when content is distinct and actionable, items need comparison in a grid, or interaction boundaries must be obvious.

**Never nest cards.** Use spacing, type, and subtle dividers inside a single surface.

---

## Container queries

Viewport queries → page layout. Container queries → components.

```html
<div class="container-inline">
  <article class="card-adaptive">…</article>
</div>
```

A card in a narrow sidebar stays compact; the same markup in a wide column expands without viewport hacks.

---

## Optical adjustments

- Flush-start text: `.optical-align-start` (`margin-inline-start: -0.05em`)
- Play / arrow icons: `.optical-align-play`, `.optical-align-arrow-forward`, `.optical-align-arrow-back`

---

## Touch targets

Minimum **44×44px** hit area. Visual control can be smaller:

```html
<button type="button" class="tap-target-expand h-6 w-6 …" aria-label="…">…</button>
```

Coarse-pointer media rules in `index.css` still enlarge `.icon-button` / `.ghost-button` where those classes apply.

---

## Depth & elevation

**Z-index** (use Tailwind `z-dropdown`, `z-modal`, etc. — do not invent `z-[37]`):

| Token | Typical use |
|-------|-------------|
| `--z-dropdown` | Menus, popovers |
| `--z-sticky` | Sticky chrome, skip link |
| `--z-modal-backdrop` | Modal scrim |
| `--z-modal` | Modal panel |
| `--z-toast` | Toasts |
| `--z-tooltip` | Tooltips |

**Shadows:** `shadow-elevation-sm` … `shadow-elevation-xl`. Keep them subtle; glass panels may add brand glow on top, not instead of, the scale.

---

## Migration notes

Legacy Tailwind defaults (`gap-4`, `p-5`, `z-50`) are often on-scale but unnamed. Prefer semantic utilities (`gap-md`, `z-dropdown`) in new code. Existing screens can migrate incrementally.
