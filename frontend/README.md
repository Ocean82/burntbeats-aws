# Burnt Beats Frontend

React (Vite) single-page application — the browser-based stem separation workstation.

## Tech Stack

- **React 18** + TypeScript + Vite
- **Tailwind CSS** (custom dark-mode config)
- **Radix UI** primitives + shadcn/ui components
- **Framer Motion** (restrained, purposeful transitions)
- **Zustand** (lightweight state management)
- **Web Audio API** (playback, mixing, real-time DSP)
- **Clerk** (authentication)
- **Stripe.js** (payments, pricing tables)
- **Vitest** + **Playwright** (testing)

## Quick Start

```bash
npm install --legacy-peer-deps
npm run dev        # http://localhost:5173
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build → `dist/` |
| `npm run typecheck` | TypeScript type check (no emit) |
| `npm run lint` | ESLint (zero warnings in CI) |
| `npm run test:run` | Vitest unit tests (single pass) |
| `npm run test` | Vitest in watch mode |
| `npm run test:e2e` | Playwright end-to-end suite |
| `npm run quality:baseline` | Bundle size + orchestration gates |

## Architecture

### Post-Split Workspace

After stem separation, the workspace operates in two modes:

1. **Listen Mode** (default) — Transport bar + stacked waveform lanes with per-stem Solo/Mute/Volume. Minimal cognitive load for first-time users.

2. **Advanced Mode** (toggle via "Mixer" button) — Reveals:
   - Left tool sidebar (Pitch, EQ, Time Stretch, Amplitude, FX, Analyze)
   - Right effects panel with full controls per selected stem
   - Bottom mixer console with channel strips + master bus

3. **Stem Focus Overlay** — Expand any individual stem to full-screen for focused editing with inline tool drawers.

### Audio Engine

- Raw Web Audio API (`AudioContext`, `AudioBufferSourceNode`, `GainNode`)
- No Tone.js in the mixer (used only in beat maker)
- `pitch-plugin` library for real-time pitch/tempo shifting
- `wavesurfer.js` for waveform visualization (legacy multi-stem-editor)
- Custom canvas rendering for workspace waveform lanes

### State Management

- **Zustand** (`appStore`) — global app state (upload, split progress, results)
- **React Context** (`WorkflowContext`) — per-stem editor states (mixer, trim, pitch)
- **React Context** (`AudioContext`) — playback engine, master bus, analysers

## Testing

- **771+ unit tests** via Vitest (jsdom environment)
- **Playwright e2e** for critical flows (upload → split → workspace)
- **Property-based tests** for audio utilities and UI state machines
- CI enforces zero ESLint warnings, TypeScript clean, and bundle size budgets

## Design System

See root-level `DESIGN.md` for the full "Midnight Forge" design system specification (colors, typography, components, do's/don'ts).

Frontend-specific design docs:
- `COLOR-CONTRAST.md` — OKLCH palette, WCAG ratios
- `MOTION-DESIGN.md` — Transition curves, reduced-motion
- `RESPONSIVE-DESIGN.md` — Breakpoints, fluid typography
- `SPATIAL-DESIGN.md` — 4px grid, elevation, touch targets
