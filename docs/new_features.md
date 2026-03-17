# UPDATED 2026-03-17
"Frontend UI/UX Enhancement Report: Burnt Beats"

### Overview

This is a stem splitter/mixer application built with React + Vite + Tailwind CSS. It features a dark theme with warm orange/amber accents, glassmorphic panels, and audio waveform visualization.

---

### Identified Areas for Improvement

#### 1. **Information Architecture & Cognitive Load**

| Issue                                 | Description                                                         | Impact                                                      |
| ------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Monolithic Page**                   | Everything is on a single scrolling page (~1,737 lines in one file) | Users may feel overwhelmed; hard to focus on current task   |
| **Too Many Controls Visible at Once** | All stem toggles, presets, options shown before file upload         | Creates decision paralysis; clutters the initial experience |
| **Redundant Information**             | The header MetricCards repeat what the pipeline steps show          | Wastes valuable above-the-fold space                        |


#### 2. **User Flow & Progressive Disclosure**

| Issue                              | Description                                                                                 | Recommendation                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **No Clear Starting Point**        | Despite step labels, the visual hierarchy doesn't guide users                               | Implement a proper wizard/stepper pattern with one active step at a time |
| **Mixer Controls Before Split**    | Users see trim/level/pan controls before they have any stems                                | Hide mixer section until stems are actually generated                    |
| **"Pick Stems to Show" Confusion** | This toggle section appears before split, but what stems to show isn't relevant until after | Move to post-split configuration                                         |


#### 3. **Visual Hierarchy & Spacing**

| Issue | Description |
| ----- | ----------- ||
| **Inconsistent Panel Density** | Some panels are cramped (stem options), others sparse (status panel)                                     |
| **Button Toolbar Clutter**     | The "Play mix / Export WAV / Load to tracks / Reset levels" row has 4 actions that compete for attention |
| **Waveform Cards Too Tall**    | Each StemCard is ~250-300px tall; with 4 stems, that's 1000+ pixels of scrolling                         |


#### 4. **Mobile Responsiveness Concerns**

| Issue | Description |
| ----- | ----------- ||
| **Button Wrapping**        | On mobile, the action buttons in stem cards wrap awkwardly         |
| **Radio Button Labels**    | "2 stems (vocals + instrumental)" text truncates on narrow screens |
| **Waveform Visualization** | 1024 bars don't scale well to small viewports                      |


#### 5. **Interaction Design Issues**

| Issue | Description |
| ----- | ----------- ||
| **Mute Button Doesn't Change**         | Line 1531: `{muted ? "Mute" : "Mute"}` - both states show same label |
| **No Visual Feedback for Muted State** | Muted stems look nearly identical to unmuted ones                    |
| **No Keyboard Navigation**             | Trim sliders work, but no keyboard shortcuts for play/stop/solo      |
| **Missing Loading Skeletons**          | When stems are loading, the UI jumps; no skeleton states             |


#### 6. **Accessibility Gaps**

| Issue | Description |
| ----- | ----------- ||
| **Low Contrast Text**    | `text-white/42`, `text-white/48`, `text-white/50` are below WCAG AA |
| **No Skip Links**        | Long page with no way to jump to main content                       |
| **Missing Focus States** | Custom buttons lack visible focus indicators                        |
| **No Aria-Live Regions** | Status changes (splitting, ready) aren't announced                  |


#### 7. **Performance & UX Polish**

| Issue | Description |
| ----- | ----------- ||
| **Animation Overload** | Multiple competing animations (fire-orb pulse, scroll text, wave bars, step glow) |
| **No Error Recovery**  | When split fails, the only feedback is a red text box                             |
| **No Undo/Redo**       | Trim and mixer changes can't be undone (only full reset)                          |
| **Missing Tooltips**   | Icons like Solo/Mute have no explanatory tooltips for new users                   |


#### 8. **Component Structure**

| Issue | Description |
| ----- | ----------- ||
| **Massive Single File**    | 1,737 lines in App.tsx makes maintenance difficult                      |
| **Inline Styles**          | Stem colors use inline styles instead of CSS variables                  |
| **No Component Splitting** | Header, Upload, Options, StemRack, StatusPanel should be separate files |


---

### Priority Recommendations

**High Priority (UX Critical):**

1. Fix the mute button label bug (shows "Mute" for both states)
2. Implement progressive disclosure - hide mixer until stems exist
3. Improve text contrast for accessibility compliance
4. Add proper visual states for muted/soloed stems


**Medium Priority (Experience Enhancement):**
5. Split into a proper step-by-step wizard flow
6. Add loading skeletons for stem processing
7. Collapse stem cards by default, expand on interaction
8. Reduce animation complexity

**Lower Priority (Code Quality):**
9. Split App.tsx into smaller components
10. Move stem colors to CSS variables
11. Add keyboard shortcuts for power users
12. Implement undo/redo for mixer changes

## Additional UI Enhancement Opportunities

### 1. **Keyboard Shortcuts for Power Users**

| Feature                  | Benefit                            |
| ------------------------ | ---------------------------------- |
| `Space` - Play/Stop mix  | Quick hands-free playback control  |
| `1-4` - Solo stems 1-4   | Rapid A/B comparison between stems |
| `M` - Mute selected stem | Fast workflow for mixing           |
| `Cmd/Ctrl + E` - Export  | Quick export shortcut              |


### 2. **Waveform Playhead & Position Indicator**

Currently the waveforms are static. Adding:

- A moving playhead during playback showing current position
- Click-to-seek functionality on waveforms
- Visual timeline with time markers (0:00, 0:30, 1:00, etc.)


### 3. **Audio History / Undo-Redo Stack**

- Track mixer adjustments (level, pan, trim) with undo/redo
- History panel showing recent changes
- "Reset to original" for individual stems


### 4. **Preset Management for Mixer Settings**

- Save custom mixer presets ("DJ Mix", "Vocals Forward", etc.)
- Quick-apply presets across projects
- Share preset configurations


### 5. **Visual Feedback During Processing**

- Real-time spectral analysis or waveform preview during split
- Estimated time remaining based on file duration
- Stage indicators (Uploading -> Analyzing -> Separating -> Finalizing)


### 6. **Mobile-Optimized Touch Interactions**

- Pinch-to-zoom on waveforms
- Swipe gestures for stem navigation
- Haptic feedback on button presses
- Collapsible stem cards for vertical scrolling


### 7. **Audio Comparison Mode**

- A/B toggle between original track and split mix
- Side-by-side waveform comparison
- "Before/After" split preview


### 8. **Batch Processing Queue**

- Queue multiple tracks for splitting
- Background processing indicator
- Notification when jobs complete


### 9. **Export Options Enhancement**

- Format selection (WAV, MP3, FLAC)
- Quality/bitrate selection
- Export individual stems vs. mixed master
- Zip download option for all stems


### 10. **Onboarding & Help System**

- First-time user tour/walkthrough
- Contextual tooltips on hover
- Help modal with FAQ and shortcuts
- Sample demo track to try the app

---

## Implementation Status (as of 2026-03-17)

Items below are verified against the current app. **Done** = implemented and wired. **Partial** = UI or logic exists but not fully wired. **Not done** = not implemented.

### High / Medium / Lower Priority

| # | Recommendation | Status | Notes |
|---|----------------|--------|-------|
| 1 | Fix mute button label | **Done** | Shows "Unmute" / "Mute" and title "Unmute this stem" / "Mute this stem" (`App.tsx` StemCard). |
| 2 | Progressive disclosure – hide mixer until stems | **Done** | Mixer section gated by `splitResultStems.length > 0`; placeholder shown when no stems. |
| 3 | Improve text contrast (WCAG AA) | **Partial** | Some `text-white/42`–`/50` remain; focus states and `.skeleton` exist in CSS. |
| 4 | Visual states for muted/soloed | **Done** | Muted: opacity, grayscale, border; solo: amber highlight; `aria-label` includes "(muted)" / "(soloed)". |
| 5 | Step-by-step wizard | **Partial** | Pipeline steps and progress indicator; single scrolling page, not strict one-step wizard. |
| 6 | Loading skeletons for stem processing | **Partial** | `.skeleton` and `skeletonShimmer` in `index.css`; not yet applied to stem loading UI. |
| 7 | Collapse stem cards by default | **Not done** | Cards always expanded. |
| 8 | Reduce animation complexity | **Partial** | Animations present; no recent reduction. |
| 9 | Split App.tsx into smaller components | **Partial** | PipelineStep, WaveformEditor, HelpModal, ExportOptionsModal, MixerPresetsModal, OnboardingTour, BatchQueue, ComparisonToggle extracted; App still large. |
| 10 | Move stem colors to CSS variables | **Partial** | Stem colors still inline (e.g. `stem.glow`); some focus uses CSS. |
| 11 | Keyboard shortcuts | **Done** | Space, 1–4 (solo), M (mute), Cmd+E (export), Cmd+Z/Y (undo/redo), ?, Esc via `useKeyboardShortcuts` and HelpModal. |
| 12 | Undo/redo for mixer (and trim) | **Done** | `useHistory` for mixer and trim; edits push to history; Undo/Redo buttons restore mixer; trim history populated for potential future trim undo. |

### Additional Enhancements

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Keyboard shortcuts | **Done** | See above. |
| 2 | Waveform playhead | **Partial** | `playheadPosition` state and playhead interval during play; StemCard accepts `playheadPosition`; click-to-seek and time markers not implemented. |
| 3 | Audio history / undo-redo | **Done** | Mixer and trim history; Undo/Redo toolbar; no separate "history panel" or "reset to original" per stem. |
| 4 | Preset management | **Done** | MixerPresetsModal: save/load presets (localStorage), default presets (e.g. Vocals Forward, Instrumental Focus), load applies mixer/trim/muted. |
| 5 | Visual feedback during processing | **Partial** | Progress from backend polling; pipeline step indicators; no spectral preview or ETA. |
| 6 | Mobile touch (pinch, swipe, haptics) | **Not done** | Responsive layout; no pinch-to-zoom, swipe nav, or haptics. |
| 7 | Audio comparison (A/B) | **Done** | ComparisonToggle; original decoded on upload (`originalAudioBuffer`); Play mix plays original when "Original" selected in compare mode. |
| 8 | Batch processing queue | **Done** | BatchQueue: add to queue, process next, progress; stems from last completed job applied to mixer. |
| 9 | Export options (format, quality, target, zip) | **Partial** | ExportOptionsModal (WAV/MP3/FLAC, quality, master/stems/all, normalize); export still produces master WAV only; options reserved for future. |
| 10 | Onboarding & help | **Done** | OnboardingTour; HelpModal (shortcuts, FAQ); tooltips on some controls (e.g. Mute/Unmute, Undo/Redo). No sample demo track. |

### Compatibility

- All implemented features use existing API and state: split, status polling, stem URLs, stemBuffers, trimMap, mixerState, mutedStems, soloStems.
- A/B comparison decodes the uploaded file in a `useEffect` when `uploadedFile` is set; clearing the file clears `originalAudioBuffer`.
- Undo/redo and presets operate on the same `mixerState` / `trimMap` used by play and export; no conflicts.

### New since 2026-03-17

| Feature | Status | Notes |
|---------|--------|------|
| 2-stem first, then expand to 4 | **Done** | Default split is 2-stem; "Keep going → 4 stems" runs expand (Demucs on instrumental). |
| Load stems (mashup) | **Done** | Source mode "Load stems (mashup)": add WAV/MP3 files as mixer tracks. |
| Pitch + time stretch | **Done** | Per-stem pitch (semitones) and time stretch; effective rate = 2^(pitch/12) / timeStretch. |
| Source mode (Split \| Load) | **Done** | Tab: Split a track vs Load stems. |