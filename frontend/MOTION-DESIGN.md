# Motion design (Burnt Beats product)

**Product app:** 150–250ms transitions, state feedback only — no page-load choreography.  
**Marketing (`LandingPage`):** may use richer entrance; keep separate from editor.

Tokens: [`src/design-tokens-motion.css`](src/design-tokens-motion.css) · Presets: [`src/motion/presets.ts`](src/motion/presets.ts) · Hook: [`src/motion/useProductMotion.ts`](src/motion/useProductMotion.ts)

---

## Strategy (product)

| Layer | What | Examples |
|-------|------|----------|
| **Feedback** | Acknowledge input | `tap-feedback`, button `active:scale`, toast slide |
| **Transition** | Smooth state change | Modals, tab views (opacity), expand/collapse |
| **Loading** | Progress / pulse | Split progress, `animate-spin` on actions |
| **Delight** | Minimal | Success pulse, ready-to-load glow — not scattered |

**Hero moment (product):** none — users are in a task. One signature animation lives on **Landing**, not in the editor.

---

## Timing

| Token | ms | Use |
|-------|-----|-----|
| `--motion-instant` | 120 | Press, toggle |
| `--motion-fast` | 180 | Hover, menu, modal backdrop |
| `--motion-normal` | 220 | View crossfade, panel reveal |
| `--motion-exit` | 165 | Exits (~75% of enter) |

**Easing:** `--ease-out-quart` only. No bounce / elastic.

---

## Implementation

```tsx
import { useProductMotion } from "@/motion/useProductMotion";

const motion = useProductMotion();

<motion.div {...motion.modalBackdrop} />
<motion.div {...motion.modalContent} />
<motion.section {...motion.viewSwitch} />
```

Modals: replace `type: "spring"` with `useProductMotion().modalContent`.

---

## CSS

- `.tap-feedback` — press scale (existing)
- `@media (hover: hover)` — hover lift on glass cards
- `.motion-ping` — badge ping; disabled when `prefers-reduced-motion: reduce`
- Radix `animate-in` on sheet/select: `duration-200` enter, `duration-150` exit

---

## Accessibility

Global `prefers-reduced-motion: reduce` in `index.css` zeros transitions/animations. Framer `useReducedMotion()` + `reduceMotion` props on editor shells still pass `duration: 0`.

**Never** hide required actions behind hover-only motion.

---

## Related

- [`RESPONSIVE-DESIGN.md`](RESPONSIVE-DESIGN.md) — pointer vs hover
- [`COLOR-CONTRAST.md`](COLOR-CONTRAST.md)
