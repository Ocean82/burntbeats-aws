# Responsive design (Burnt Beats frontend)

Mobile-first layout, input-aware interactions, and safe areas. Tokens: [`src/design-tokens-responsive.css`](src/design-tokens-responsive.css).

---

## Mobile-first

Base styles target narrow viewports. Add complexity with **`min-width`** (Tailwind `sm:`, `md:`, `lg:`), not `max-width` overrides.

| Breakpoint | px | Use |
|------------|-----|-----|
| (base) | &lt;640 | Single column, drawers, compact chrome |
| `sm` | 640 | Horizontal tabs, slightly roomier modals |
| `md` | 768 | Marquee, two-column tool areas |
| `lg` | 1024 | Full header toolbar, wide mixer |

Breakpoints are **content-driven** defaults; add a new step only when the layout actually breaks.

---

## Fluid values

Prefer `clamp()` for type and gutters when a single breakpoint is not enough:

- `text-fluid-sm` … `text-fluid-xl`
- `--space-fluid-gutter`, `--space-fluid-section` in `:root`

---

## Input method (not just screen width)

| Query | Utility / pattern |
|-------|-------------------|
| `(pointer: fine)` | Default padding; smaller DJ controls at `sm+` |
| `(pointer: coarse)` | 44px targets (`.icon-button`, faders, mute/solo) |
| `(hover: hover)` | `.glass-card:hover`, `.hover-lift` |
| `(hover: none)` | No hover-only affordances; use `:active` / visible controls |

**Never hide required actions behind hover-only UI.**

---

## Safe areas

`index.html` uses `viewport-fit=cover`. Body sets horizontal and bottom insets; use utilities for fixed UI:

- `.pt-safe` — top notch
- `.pb-safe` / `.mb-safe` / `.bottom-safe` — home indicator
- `.px-safe` — side insets
- `.inset-safe-bottom` — `max(1rem, env(safe-area-inset-bottom))` for footers
- `.fixed-bottom-safe` — `max(1.25rem, env(safe-area-inset-bottom))` for fixed toasts/chips
- `.fixed-top-safe` — respects top notch for fixed headers

---

## Layout patterns

| Pattern | Mobile | `sm+` / `lg+` |
|---------|--------|----------------|
| Workspace tabs | Scrollable row (`editor-header`) | Inline toolbar |
| Settings / account | `SettingsMenu` (⋯) + `AccountMenu` | Same on `sm+`; header wraps on narrow viewports |
| Modals | `.modal-viewport-height` + `dvh` | Extra vertical margin |
| DJ lanes | 72px lane height | 96px at `sm+` |
| Tables | Prefer cards / stacked rows | Full table when space allows |

---

## Images

Use `srcset` + `sizes` for marketing heroes; `<picture>` when crop changes (not just resolution). App icons/static assets stay in `public/`.

---

## Related

- [`SPATIAL-DESIGN.md`](SPATIAL-DESIGN.md) — spacing, touch targets
- [`COLOR-CONTRAST.md`](COLOR-CONTRAST.md) — contrast on all viewports
