---
name: Burnt Beats
description: Browser-based stem separation and mixing workstation for producers.
colors:
  ember-primary: "oklch(63% 0.21 38)"
  ember-deep: "oklch(55% 0.19 38)"
  ember-hot: "oklch(69% 0.18 38)"
  ice-accent: "oklch(72% 0.12 205)"
  ice-cold: "oklch(78% 0.11 205)"
  forge-base: "oklch(7% 0.012 38)"
  forge-raised: "oklch(11% 0.014 38)"
  forge-overlay: "oklch(15% 0.016 38)"
  ash-foreground: "oklch(96% 0.012 75)"
  ash-muted: "oklch(72% 0.014 48)"
  midi-gold: "oklch(68% 0.14 75)"
  stem-vocals: "oklch(65% 0.24 350)"
  stem-drums: "oklch(72% 0.12 205)"
  stem-bass: "oklch(78% 0.22 135)"
  stem-melody: "oklch(78% 0.16 75)"
  success-green: "oklch(62% 0.14 155)"
  warning-gold: "oklch(78% 0.14 78)"
  error-red: "oklch(58% 0.2 25)"
typography:
  display:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "clamp(1.5rem, 1.25rem + 1vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(0.875rem, 0.84rem + 0.25vw, 1rem)"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.34em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "16px"
  xl: "2rem"
  full: "9999px"
spacing:
  2xs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
  4xl: "96px"
components:
  button-fire:
    backgroundColor: "linear-gradient(135deg, #cc2200, #ff5500 35%, #ff8800 65%, #ffbb33)"
    textColor: "#fffbf8"
    rounded: "{rounded.full}"
    padding: "15px 19px"
  button-fire-hover:
    backgroundColor: "linear-gradient(135deg, #cc2200, #ff5500 35%, #ff8800 65%, #ffbb33)"
    textColor: "#fffbf8"
    rounded: "{rounded.full}"
    padding: "15px 19px"
  button-ghost:
    backgroundColor: "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03))"
    textColor: "rgba(255, 249, 244, 0.86)"
    rounded: "{rounded.full}"
    padding: "12px 16px"
  button-ghost-hover:
    backgroundColor: "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(0,200,255,0.14))"
    textColor: "rgba(255, 249, 244, 0.86)"
    rounded: "{rounded.full}"
    padding: "12px 16px"
  card-glass:
    backgroundColor: "oklch(11% 0.014 38 / 74%)"
    textColor: "{colors.ash-foreground}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input-field:
    backgroundColor: "oklch(20% 0.015 40)"
    textColor: "{colors.ash-foreground}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
---

# Design System: Burnt Beats

## 1. Overview

**Creative North Star: "The Midnight Forge"**

Where raw audio is heated, shaped, and cooled into something refined. Fire is creation, energy, action. Ice is control, precision, information. The interface is the forge itself: dark, hot at the edges, responsive to touch, and built to run all night.

This system rejects sterile corporate SaaS aesthetics, sketchy freeware energy, and bare-bones developer minimalism with equal force. It also refuses the one-trick-pony trap: every surface communicates workflow depth, not single-action utility. The visual language draws from iZotope's spectral precision, Linear's kinetic snappiness, Splice's organized density, and FabFilter's fluid interactivity.

The result is a dark, immersive environment that feels like sitting down at an expensive piece of studio hardware that happens to live in a browser tab. Density is earned, not decorative. Motion confirms state, never entertains. Color encodes meaning through a strict thermal vocabulary.

**Key Characteristics:**
- Dark-only. No light mode. The forge runs hot in a dim room.
- Thermal color encoding: warm hues = action/energy/CTA; cool hues = tool chrome/information/secondary.
- Glassmorphic surfaces with prismatic sheens and thermal edge glows, used structurally (not decoratively).
- Compact, high-density layouts inspired by hardware channel strips and DAW mixers.
- Exponential ease-out curves (quart/quint/expo). No bounce, no elastic, no spring.
- OKLCH color space throughout. Neutrals tinted to brand hue (chroma 0.005-0.014). Never pure gray, never #000 or #fff.

## 2. Colors

A committed thermal palette: ember orange carries 30-40% of interactive surfaces (CTAs, active states, brand moments), ice blue provides the counterweight for tool chrome and informational elements, and ember-tinted neutrals form the dark forge base.

### Primary

- **Ember Primary** (oklch(63% 0.21 38)): The fire. CTAs, active states, brand accent, focus rings. High chroma at mid-lightness; reduced toward extremes per OKLCH best practice.
- **Ember Deep** (oklch(55% 0.19 38)): Hover/pressed states on primary elements. Slightly darker, slightly less saturated.
- **Ember Hot** (oklch(69% 0.18 38)): Lighter primary for badges, highlights, and secondary emphasis.

### Secondary

- **Ice Accent** (oklch(72% 0.12 205)): Tool chrome, informational elements, secondary actions. The cool counterpoint to ember.
- **Ice Cold** (oklch(78% 0.11 205)): Lighter ice for hover states, subtle highlights, and instrumental stem lane.

### Tertiary

- **MIDI Gold** (oklch(68% 0.14 75)): Dedicated accent for the MIDI conversion tool. Warm gold distinguishes it from the stem separation workflow.

### Neutral

- **Forge Base** (oklch(7% 0.012 38)): The deepest surface. App background. Near-black with ember tint.
- **Forge Raised** (oklch(11% 0.014 38)): Cards, panels, elevated containers. One step up from base.
- **Forge Overlay** (oklch(15% 0.016 38)): Popovers, modals, dropdown surfaces. Highest neutral elevation.
- **Ash Foreground** (oklch(96% 0.012 75)): Primary text. Warm off-white, never pure #fff.
- **Ash Muted** (oklch(72% 0.014 48)): Secondary text, placeholders, disabled states.

### Semantic

- **Success Green** (oklch(62% 0.14 155)): Completion, ready states, meters in safe range.
- **Warning Gold** (oklch(78% 0.14 78)): Approaching limits, caution states.
- **Error Red** (oklch(58% 0.2 25)): Failures, destructive actions, meters in danger range.

### Stem Lanes

- **Vocals** (oklch(65% 0.24 350)): Neon pink/magenta. High luminance contrast against drums.
- **Drums** (oklch(72% 0.12 205)): Cool cyan. Distinct temperature from vocals.
- **Bass** (oklch(78% 0.22 135)): Bright green. High chroma, unique hue quadrant.
- **Melody/Other** (oklch(78% 0.16 75)): Warm gold. Shares MIDI accent family.
- **Instrumental** (oklch(78% 0.11 205)): Pale ice. Lower chroma than drums for differentiation.

### Named Rules

**The Thermal Encoding Rule.** Warm hues (ember, gold) mean action, energy, user-initiated. Cool hues (ice, frost) mean information, system-state, tool chrome. Mixing these semantics is forbidden.

**The Never-Pure Rule.** No #000, no #fff, no chroma-0 grays anywhere in the system. Every neutral is tinted toward the brand hue (ember 38°) at chroma 0.005-0.014. Purity looks sterile; tint looks intentional.

**The Stem Distinction Rule.** Stem lane colors are chosen for luminance AND temperature separation, not just hue. A deuteranopic user must distinguish every lane by brightness alone. Color is never the sole identifier; every lane carries a persistent icon or text label.

## 3. Typography

**Display Font:** Space Grotesk (with sans-serif fallback)
**Body Font:** Manrope (with sans-serif fallback)
**DAW/Compact UI:** System UI stack (ui-sans-serif, system-ui, -apple-system, Segoe UI)

**Character:** Geometric precision meets humanist warmth. Space Grotesk brings technical authority to headlines; Manrope softens body text with optical adjustments that read well at small sizes in dim environments. The DAW subsystem uses system fonts at compact sizes (10-13px) for maximum density and rendering clarity.

### Hierarchy

- **Display** (700, clamp(1.5rem, 1.25rem + 1vw, 2.25rem), line-height 1.1): Hero headlines, landing page titles. Space Grotesk only. Letter-spacing -0.01em for optical tightening at large sizes.
- **Headline** (700, clamp(1.125rem, 1rem + 0.5vw, 1.5rem), line-height 1.2): Section headers, panel titles. Space Grotesk.
- **Title** (600, 1rem, line-height 1.3): Card headers, dialog titles, navigation labels. Manrope.
- **Body** (400, clamp(0.875rem, 0.84rem + 0.25vw, 1rem), line-height 1.5): Paragraphs, descriptions, form labels. Manrope. Max line length 65-75ch.
- **Label** (600, 0.6875rem, line-height 1.3, letter-spacing 0.34em, uppercase): Eyebrows, metadata, status indicators. Manrope.
- **Meta** (400, 0.75rem mobile / 0.6875rem desktop, line-height 1.125rem): Compact metadata in tool chrome. Manrope.

### Named Rules

**The Fluid Scale Rule.** All type sizes use clamp() for fluid scaling between mobile and desktop. No breakpoint-driven font-size jumps. The scale flows; it never snaps.

**The DAW Exception Rule.** Inside the mixer/editor workspace, typography switches to system UI at 10-13px. This is not a violation; it's a deliberate density mode for the tool surface where every vertical pixel matters.

## 4. Elevation

The system uses a hybrid approach: tonal layering (progressively lighter surfaces) establishes the spatial hierarchy at rest, while shadows activate on interaction (hover, drag, focus) to signal state change. Shadows are never decorative; they're feedback.

Glass surfaces add a third layer: backdrop-filter blur + prismatic sheens create depth through transparency rather than shadow. The fire-and-ice edge glows on glass panels are structural markers (left = fire/warm, right = ice/cool), not decoration.

### Shadow Vocabulary

- **Elevation SM** (`0 1px 2px rgba(0,0,0,0.22)`): Subtle lift for buttons at rest, chips, small interactive elements.
- **Elevation MD** (`0 4px 12px rgba(0,0,0,0.26)`): Cards, raised panels, dropdown triggers on hover.
- **Elevation LG** (`0 8px 24px rgba(0,0,0,0.3)`): Glass panels, active modals, dragged elements.
- **Elevation XL** (`0 16px 40px rgba(0,0,0,0.34)`): Full-screen overlays, hero elements on landing page.
- **Glass Rim Fire** (`-2px 0 0 rgba(255,80,20,0.42)`): Left-edge thermal glow on glass surfaces.
- **Glass Rim Ice** (`2px 0 0 rgba(0,200,255,0.38)`): Right-edge thermal glow on glass surfaces.

### Named Rules

**The State-Driven Shadow Rule.** Surfaces are tonally layered at rest (forge-base → forge-raised → forge-overlay). Shadows appear only as a response to state: hover lifts, drag elevates, focus rings glow. If a shadow is visible without interaction, justify it or remove it.

**The Thermal Rim Rule.** Glass panels carry fire (left) and ice (right) edge glows as structural orientation markers. These are not decorative borders; they encode the thermal axis of the interface. A panel without both rims is either intentionally neutral or incorrectly styled.

## 5. Components

### Buttons

- **Shape:** Fully rounded (9999px radius). Pill-shaped. No sharp corners on any button variant.
- **Fire Button (Primary CTA):** Ember gradient background (cc2200 → ff5500 → ff8800 → ffbb33), warm white text (#fffbf8), polished-top sheen (linear-gradient overlay), heavy glow shadow (22px 52px spread at rgba(255,60,10,0.35)). Padding 15px 19px.
- **Hover:** translateY(-2px) scale(1.02), brightness(1.14), intensified glow.
- **Active:** translateY(0) scale(0.98), inset shadow, concentrated glow.
- **Focus:** 2px background-color ring + 4px primary ring. No outline.
- **Disabled:** opacity 0.5, grayscale(0.15), no transform, minimal shadow.
- **Ghost Button (Secondary):** Transparent with ice-tinted border (rgba(0,200,255,0.18)), subtle gradient background, warm off-white text. Padding 12px 16px.
- **Hover:** translateY(-2px), border intensifies to rgba(0,220,255,0.55), ice glow (32px spread).
- **Active:** translateY(0) scale(0.97), concentrated ice glow.

### Cards / Containers

- **Glass Panel:** The primary container. Backdrop-filter blur(32px) saturate(200%) brightness(1.1). Prismatic internal gradients (warm diagonal + cool counter-diagonal). Fire rim left, ice rim right. Polished-top sheen (white gradient fading down). Border 1px solid rgba(255,255,255,0.12) with colored left/right edges.
- **Glass Card:** Lighter variant of glass panel. blur(24px) saturate(190%). Hover lifts translateY(-4px) with intensified border colors. Touch devices get scale(0.995) on active instead.
- **Corner Style:** Rounded large (16px) for panels and cards. Rounded XL (2rem) for hero sections.
- **Internal Padding:** 16px (md) default. 24px (lg) on desktop for spacious panels.

### Inputs / Fields

- **Style:** Solid dark background (oklch(20% 0.015 40)), 1px border matching card borders, rounded medium (8px).
- **Focus:** Border shifts to primary ring color, subtle glow appears.
- **Placeholder:** oklch(70% 0.013 50) — warm muted, WCAG AA compliant against input background.

### Stem Controls

- **Toggle Buttons:** Rounded full, 1px border. Inactive: neutral border, muted text. Active: border and text shift to stem lane color, outer glow in stem color at 44% opacity.
- **Stem Dot:** 10px circle, stem lane color, subtle glow. Active state intensifies glow radius.
- **Sliders (Burn Slider):** Custom range input. Track: 8px rounded full, fire-to-ice gradient. Thumb: 19px circle, white-to-ember gradient, 4px ember glow ring, 24px ambient glow.
- **Hit targets:** All stem controls maintain 44×44px minimum interactive area via `::before` pseudo-element expansion, regardless of visual size.

### Navigation

- **App Shell:** Sidebar background at oklch(9% 0.013 38). Sidebar border at oklch(28% 0.016 42 / 40%). Active item uses sidebar-accent (oklch(16% 0.015 38)) with primary ring on focus.
- **Landing Nav:** Flex row, items-center, justify-between. Logo left, auth buttons right. Ghost + Fire button pairing.

### Meters

- **Meter Slot:** 92px tall, 20px wide, rounded full, inset gradient background (white 8% top to black 30% bottom), 1px border.
- **Meter Fill:** Absolute bottom-up, rounded full, ember glow shadow (18px spread). Animated rise (3s ease-in-out infinite alternate).

## 6. Do's and Don'ts

### Do:

- **Do** use OKLCH for all color definitions. Reduce chroma as lightness approaches 0 or 100.
- **Do** tint every neutral toward ember hue 38° at chroma 0.005-0.014. The forge is warm, never sterile.
- **Do** maintain 4.5:1 contrast ratio minimum for all text. Use solid backdrop fallbacks behind glassmorphic surfaces when text readability is at risk.
- **Do** use exponential ease-out curves (quart/quint/expo) for all transitions. Product transitions at 120-320ms; brand entrances at 500-600ms.
- **Do** ensure every interactive element has a minimum 44×44px tap target, even when the visual element is smaller.
- **Do** pair every stem lane color with a persistent text label or icon. Color is reinforcement, never the sole identifier.
- **Do** show workflow depth on every surface. If a user can only see "upload and split," the design has failed.
- **Do** use the thermal axis consistently: fire/warm = left, action, creation; ice/cool = right, information, control.

### Don't:

- **Don't** use flat white backgrounds, generic blue primaries, or corporate illustrations. This is not project management software. (Anti-ref: sterile corporate SaaS.)
- **Don't** use flashing buttons, intrusive banners, cluttered text instructions, or anything that looks like a free MP3 converter site. (Anti-ref: sketchy YouTube converter.)
- **Don't** leave surfaces unstyled with system fonts and raw gray backgrounds. Musicians buy into magic, not GitHub repos with a frontend bolted on. (Anti-ref: bare-bones developer project.)
- **Don't** reduce any view to just an upload box and a button. Every screen communicates the full workflow. (Anti-ref: one-trick pony.)
- **Don't** use #000 or #fff anywhere. No pure black, no pure white, no chroma-0 neutrals.
- **Don't** use border-left or border-right greater than 1px as a colored accent stripe on cards, list items, or alerts. The thermal rim system uses box-shadow, not borders, for edge glows.
- **Don't** use gradient text (background-clip: text). Emphasis comes from weight, size, or color; never from clipped gradients.
- **Don't** use bounce, elastic, or spring easing. Motion is precise and exponential, like a well-damped fader.
- **Don't** animate CSS layout properties (width, height, top, left). Use transform and opacity only.
- **Don't** nest cards inside cards. If you're reaching for a card-in-card, the information architecture needs rethinking.
- **Don't** use modals as the first solution. Exhaust inline disclosure, progressive reveal, and panel-based alternatives before reaching for a modal.
- **Don't** show every tool and feature on the same surface. An all-in-one view overwhelms users and buries the process under clutter. If a user can see stem splitting, MIDI conversion, speech enhancement, and the mixer simultaneously, the design has failed.
- **Do** use phased flows for complex workflows. Divide multi-step jobs (upload → configure → split → mix → export) into sequential phases where each phase only reveals controls relevant to the current step. Use animated transitions between phases to reinforce progress and direction.
- **Do** separate fundamentally different tools into distinct workspaces with their own navigation endpoints. Stem separation, MIDI conversion, and speech enhancement should each feel like focused applications that happen to share a parent shell — not features crammed into a single view.
