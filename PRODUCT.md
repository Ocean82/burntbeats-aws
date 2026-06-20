# Product

## Register

product

## Users

Music producers, DJs, and audio engineers who need high-fidelity stem separation for remixing, sampling, and production workflows. Secondary: hobbyists exploring stems for fun or learning. Tertiary: podcasters and content creators using speech enhancement services.

Context: late-night sessions, headphones on, working against a deadline or deep in creative flow. The primary job is stem splitting; everything else (mixer, MIDI conversion, speech enhancement, export) evolves from that core action.

## Product Purpose

Burnt Beats is a browser-based stem separation and mixing workstation. Users upload a track, the service splits it into isolated stems (vocals, drums, bass, melody), and provides an in-browser mixer/editor for leveling, trimming, and exporting radio-ready mixes. Additional tools include audio-to-MIDI transcription and speech enhancement.

Success looks like: a producer treats Burnt Beats as an indispensable step in their workflow, not a one-off utility. They subscribe because the tool saves hours of manual isolation work and the mixing environment keeps them inside the platform instead of bouncing to a DAW for simple tasks.

## Brand Personality

Elite, indispensable, quality.

Voice: confident and direct, like a senior engineer explaining a signal chain. No hype, no filler. The interface speaks through precision and density, not marketing copy.

Emotional goal: the user should feel like they just sat down at an expensive piece of studio hardware that happens to live in a browser tab.

## Anti-references

1. **Sterile corporate SaaS** — flat white backgrounds, generic blue primaries, corporate illustrations, stock photos. Kills artistic inspiration; looks like project management software.

2. **Sketchy YouTube MP3 converter** — intrusive ads, flashing download buttons, cluttered instructions, 2012-era UI. Users expect it to be free, feel bait-and-switched at any paywall, and will never trust it with unreleased audio.

3. **Bare-bones developer project** — unstyled dropzone on raw gray, system fonts, console-style output. Musicians buy into magic; if it looks like a GitHub repo with a frontend bolted on, they assume they could find a free script themselves.

4. **One-trick pony oversimplification** — just an upload box and a split button with zero hint of what happens next. Reduces perceived value to a rare emergency tool rather than a recurring workflow.

## Design Principles

1. **Studio-grade density** — pack information tight like a hardware controller. Every pixel earns its place; whitespace is deliberate negative space, not laziness.

2. **Show the workflow, not just the feature** — the interface reveals depth (mixer, timeline, export, integrations) so users see a platform worth subscribing to, not a one-shot utility.

3. **Engineered confidence** — interactions feel snappy and precise (Linear-speed kinetics). Transitions confirm state; nothing feels laggy or uncertain.

4. **Thermal identity** — the fire-and-ice visual language is the brand's signature. It's not decoration; it encodes meaning (warm = action/energy, cool = tool chrome/information).

5. **Magic over mechanics** — the AI inference is complex; the user experience is effortless. Hide the plumbing, surface the result.

6. **Progressive disclosure (phased flow)** — reveal the app one phase at a time. Users never see the mixer before stems exist, never see MIDI tools in the stem editor, and never face an all-at-once surface. Each workspace is a focused, sequential path through a single job type. The interface limits choice to the current step so users always know what to do next.

7. **Workspace separation** — fundamentally different tools (stem separation, MIDI conversion) live in separate workspaces with their own navigation and flow. The app is a suite of focused studios under one roof, not a single crowded room. Stem separation handles upload → split → mix → export; MIDI conversion is its own destination with its own source selection, settings, and editor. A user working on stems never sees MIDI complexity, and vice versa.

## Accessibility & Inclusion

**Standard:** WCAG AA minimum across all interactive surfaces.

**Color blindness (deuteranopia/protanopia):**
- Stem lane colors use distinct luminance levels and color temperatures, not just hue shifts.
- Color is never the sole identifier; every stem lane carries a persistent text label or icon.

**Contrast in dark mode:**
- Text maintains 4.5:1 ratio against backgrounds. Glassmorphic containers use solid backdrop fallbacks or text-shadow wrappers so text never fights shifting gradients.

**Hit targets:**
- All interactive elements (sliders, mute/solo toggles, knobs) maintain minimum 44×44px tap targets regardless of visual size.

**Reduced motion:**
- Already implemented via `useReducedMotion()` hook and CSS `prefers-reduced-motion`. All brand animations collapse to instant; product transitions remain functional but skip decorative motion.

**Keyboard & screen reader:**
- Timeline elements (split boundaries, gain nodes, region handles) are keyboard-navigable via Tab/Shift+Tab with visible focus rings.
- Stem controls carry explicit `aria-label` attributes (e.g., "Mute Vocal Stem").
