# Mobile Experience Improvement Plan

**Date:** 2026-05-06
**Scope:** Burnt Beats web app — mobile phone usability
**Priority Legend:** P0 = Critical (blocks core flow), P1 = High (degrades experience significantly), P2 = Medium (polish/enhancement), P3 = Low (nice-to-have)

---

## Executive Summary

The app's core flow (upload → split → download) works on mobile, but several friction points degrade the experience. The most impactful issues are: the file input accepting formats the backend rejects, no upload progress feedback, no resilience to network interruptions, the waveform editor being nearly unusable on small screens, and downloads failing silently on iOS Safari in certain conditions.

---

## Issue 1: File Input Accepts Unsupported Formats on Mobile

**Priority:** P0
**Impact:** Users select a file from their phone, wait for upload, then get a cryptic rejection error.

### Problem

The frontend file input uses `accept="audio/*"` which tells the mobile file picker to show **all** audio files on the device. However, the backend only accepts: `.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a`, `.aac`. Mobile users may pick `.webm`, `.opus`, `.3gp`, `.amr`, or `.caf` files — all of which will be rejected after upload completes.

### Solution

Restrict the `accept` attribute to list only supported MIME types and extensions explicitly. Add client-side validation before upload begins.

### Steps

1. Update the `<input type="file">` `accept` attribute in `ProcessingSettingsPanel.tsx` to list specific MIME types:
   ```
   accept=".mp3,.wav,.flac,.ogg,.m4a,.aac,audio/mpeg,audio/wav,audio/flac,audio/ogg,audio/mp4,audio/x-m4a,audio/aac"
   ```
2. Add a client-side file extension check in `useStemSplitting.ts` `handleFile()` before setting the file in state. Show an immediate, user-friendly error listing supported formats.
3. Update the dropzone hint text to match (already says "MP3, WAV, FLAC, M4A" — add OGG and AAC).

### Files

- `frontend/src/components/ProcessingSettingsPanel.tsx` (lines 915–920, the hidden file inputs)
- `frontend/src/hooks/useStemSplitting.ts` (`handleFile` function)
- `backend/middleware/upload.js` (reference for allowed formats)

### Tools

- Browser DevTools mobile emulation
- Real iOS Safari + Android Chrome testing

### Verification

1. On iOS, tap "Browse" — the file picker should NOT show `.webm`, `.caf`, or other unsupported files.
2. On Android, the file picker should filter to supported audio types.
3. If a user somehow selects an unsupported file (e.g., via drag-and-drop on tablet), an immediate client-side error appears before any network request.

---

## Issue 2: No Upload Progress Indicator

**Priority:** P0
**Impact:** On mobile networks (4G/LTE), uploading a 50–200MB WAV file can take 30–120 seconds. Users see no feedback and assume the app is frozen.

### Problem

The `startStemSplit` function in `api.ts` uses a single `fetch()` POST with `FormData`. There is no upload progress tracking. The UI shows nothing between "file selected" and "splitting started."

### Solution

Replace the raw `fetch()` upload with an `XMLHttpRequest` (or use the Fetch Upload Streaming API where supported) to get `progress` events. Show a progress bar during upload.

### Steps

1. Create a new utility function `uploadWithProgress(url, formData, onProgress, signal)` that uses `XMLHttpRequest` with an `upload.onprogress` handler.
2. Modify `startStemSplit` in `api.ts` to accept an optional `onUploadProgress` callback.
3. Thread the callback through `splitStems` → `useStemSplitting.triggerSplit`.
4. Add an "Uploading…" state to the progress bar UI in `ProcessingSettingsPanel.tsx` that shows before the "Splitting…" state begins.
5. Update the progress status messages: "Uploading… 45%" → "Queued" → "Separating vocals…"

### Files

- `frontend/src/api.ts` (`startStemSplit` function)
- `frontend/src/hooks/useStemSplitting.ts` (`triggerSplit`)
- `frontend/src/components/ProcessingSettingsPanel.tsx` (progress bar section)
- `frontend/src/store/appStore.ts` (add `uploadProgress` state field)

### Tools

- Chrome DevTools Network throttling (simulate 3G/4G)
- Real device testing on cellular network

### Verification

1. Throttle network to "Fast 3G" in DevTools.
2. Upload a 50MB file — a progress bar should appear showing upload percentage.
3. The progress bar should transition smoothly from "Uploading" to "Processing" states.
4. Cancelling during upload (navigating away) should abort the request cleanly.

---

## Issue 3: No Network Resilience for Upload

**Priority:** P1
**Impact:** Mobile connections are unreliable. A dropped connection mid-upload means the user must start over with no explanation.

### Problem

The upload uses a single `fetch()` with an `AbortController` timeout (5 minutes). If the network drops mid-upload, the user gets a generic "Stem split request failed" error. There's no retry mechanism, no resume capability, and no clear messaging about what happened.

### Solution

Implement upload retry with exponential backoff for transient failures. Add clear network-error messaging. For large files, consider chunked upload (future enhancement).

### Steps

1. Wrap the upload `fetch` in a retry helper (max 2 retries, exponential backoff: 2s, 4s).
2. Detect network errors specifically (`TypeError` from fetch = network failure) vs. server errors (4xx/5xx).
3. Show distinct error messages: "Connection lost. Retrying…" vs. "Server error. Please try again."
4. Add a "Retry" button on upload failure that re-attempts with the same file (file is already in state).
5. Use `navigator.onLine` to detect offline state and show a banner before the user attempts upload.

### Files

- `frontend/src/api.ts` (`startStemSplit`)
- `frontend/src/hooks/useStemSplitting.ts` (error handling in `triggerSplit`)
- `frontend/src/components/ProcessingSettingsPanel.tsx` (error display)
- New: `frontend/src/utils/retryFetch.ts`

### Tools

- Chrome DevTools → Network → Offline toggle
- Real device testing with airplane mode toggle

### Verification

1. Start an upload, toggle airplane mode mid-upload → should see "Connection lost. Retrying…"
2. Restore connection within retry window → upload should complete.
3. If all retries fail → clear error message with "Retry" button.
4. Tapping "Retry" should re-upload without requiring the user to re-select the file.

---

## Issue 4: Download Fails Silently on iOS Safari

**Priority:** P1
**Impact:** iOS Safari handles programmatic downloads differently. The `<a download>` + `click()` pattern can fail or open the file in a new tab instead of downloading.

### Problem

The `triggerDownload` function in `useExport.ts` creates an anchor element with `download` attribute and programmatically clicks it. On iOS Safari:
- Blob URLs with `<a download>` may open in a new tab instead of downloading.
- Large files (>50MB WAV) may fail silently due to memory constraints.
- ZIP files may not trigger the download sheet.

### Solution

Detect iOS Safari and use alternative download strategies. For iOS, use `window.open()` with the blob URL for single files, or present a "tap and hold to save" instruction. For large exports, prefer MP3 format on mobile by default.

### Steps

1. Create a `frontend/src/utils/downloadHelper.ts` utility that detects the platform and chooses the best download strategy.
2. For iOS Safari: use `navigator.share()` (Web Share API) when available — this lets users save to Files, AirDrop, etc.
3. Fallback for iOS: open blob URL in new window with instructions.
4. Default the export format to MP3 on mobile (detect via `window.matchMedia('(pointer: coarse)')` or screen width).
5. Show a warning when exporting WAV on mobile: "Large file — MP3 recommended for mobile."

### Files

- `frontend/src/hooks/useExport.ts` (`triggerDownload` function)
- New: `frontend/src/utils/downloadHelper.ts`
- `frontend/src/components/ExportOptionsModal.tsx` (default format selection)

### Tools

- Real iOS device (Safari) — cannot be reliably tested in emulators
- BrowserStack or similar for cross-device testing
- Safari Web Inspector (connect via Mac)

### Verification

1. On iOS Safari: export a master mix as MP3 → file should save to Downloads or trigger share sheet.
2. On iOS Safari: export stems as ZIP → download should complete (not open in new tab).
3. On Android Chrome: existing behavior should remain unchanged.
4. Export modal should default to MP3 when opened on a touch device.

---

## Issue 5: Waveform Editor Unusable on Small Screens

**Priority:** P1
**Impact:** The multi-stem waveform editor with trim handles, zoom controls, and seek is designed for mouse precision. On a 375px-wide phone screen, trim handles are nearly impossible to grab, and there's no pinch-to-zoom.

### Problem

- Trim handles on waveform lanes are thin CSS pseudo-elements — too small for finger taps.
- Zoom is controlled only by small +/- buttons (32px) — no pinch gesture support.
- Timeline scroll is a range slider — works but isn't intuitive on touch.
- The waveform lanes stack vertically with no horizontal scroll affordance.

### Solution

Add touch-optimized interactions for the waveform editor on mobile.

### Steps

1. **Enlarge trim handles on touch devices**: Use `@media (pointer: coarse)` to make trim handle hit areas at least 44px wide with visible grab indicators.
2. **Add pinch-to-zoom**: Implement a touch gesture handler on the waveform container that maps two-finger pinch to `setZoom`. Use `touch-action: none` on the container and handle `touchstart`/`touchmove` with distance calculation.
3. **Add two-finger horizontal pan**: Map two-finger horizontal swipe to `setScrollPct` for timeline navigation.
4. **Increase seek tap target**: The entire waveform lane already handles pointer events for seek — verify the hit area is adequate.
5. **Add a mobile-specific zoom/scroll hint**: On first use, show a brief tooltip: "Pinch to zoom • Two fingers to scroll."

### Files

- `frontend/src/components/multi-stem-editor/waveform-lane.component.tsx` (trim handles, pointer handling)
- `frontend/src/components/MultiStemEditor.tsx` (zoom/scroll controls)
- `frontend/src/index.css` (touch-specific styles for handles)
- New: `frontend/src/hooks/usePinchZoom.ts`

### Tools

- Chrome DevTools touch emulation
- Real device testing (iPhone SE for smallest common screen)

### Verification

1. On a phone, trim handles should be visually distinct and grabbable with a finger.
2. Pinch gesture on the waveform area should zoom in/out smoothly.
3. Two-finger horizontal swipe should scroll the timeline.
4. Single-finger tap on waveform should seek (existing behavior preserved).
5. No accidental page zoom when interacting with the waveform.

---

## Issue 6: Modals Overflow on Small Screens with Virtual Keyboard

**Priority:** P2
**Impact:** When the virtual keyboard opens (e.g., in feedback forms or search), modals using `max-h-[calc(100vh-1.5rem)]` don't account for the keyboard height, causing content to be hidden.

### Problem

Modals use `100vh` which on mobile doesn't account for:
- The browser's URL bar (dynamic viewport)
- The virtual keyboard when open
- Safe area insets on notched phones (iPhone X+)

### Solution

Use `dvh` (dynamic viewport height) units with fallback, and add safe area padding.

### Steps

1. Replace `100vh` with `100dvh` in modal max-height calculations, with a fallback:
   ```css
   max-height: calc(100vh - 1.5rem);
   max-height: calc(100dvh - 1.5rem);
   ```
2. Add `env(safe-area-inset-bottom)` padding to modal footers and fixed-position elements.
3. Add `viewport-fit=cover` to the HTML meta viewport tag to enable safe area insets.
4. Test with virtual keyboard open — modal content should remain scrollable and visible.

### Files

- `frontend/index.html` (viewport meta tag)
- `frontend/src/components/ExportOptionsModal.tsx`
- `frontend/src/components/HelpModal.tsx`
- `frontend/src/components/MixerPresetsModal.tsx`
- `frontend/src/components/OnboardingTour.tsx`
- `frontend/src/index.css` (global safe area utilities)

### Tools

- Real iOS device (Safari with notch)
- Chrome DevTools device toolbar with custom viewport

### Verification

1. Open Export modal on iPhone with notch — content should not be hidden behind the home indicator.
2. Open a modal, tap an input field — modal should remain usable with keyboard open.
3. Scroll within the modal should work without scrolling the page behind it.

---

## Issue 7: No Haptic/Vibration Feedback on Key Actions

**Priority:** P2
**Impact:** Mobile users lack tactile confirmation for important actions (split started, export complete, error occurred).

### Problem

The app has visual feedback (`.tap-feedback`, `.haptic-tap` CSS animations) but no actual device haptic feedback via the Vibration API.

### Solution

Add light haptic feedback using `navigator.vibrate()` for key moments.

### Steps

1. Create `frontend/src/utils/haptics.ts` with a `triggerHaptic(pattern: 'light' | 'medium' | 'success' | 'error')` function.
2. Call it on: split button press, split complete, export complete, error occurrence.
3. Gate behind `'vibrate' in navigator` check and respect `prefers-reduced-motion`.
4. Keep vibrations short (10–50ms) to avoid being annoying.

### Files

- New: `frontend/src/utils/haptics.ts`
- `frontend/src/hooks/useStemSplitting.ts` (split start/complete)
- `frontend/src/hooks/useExport.ts` (export complete)

### Tools

- Real Android device (Vibration API not supported on iOS Safari)
- Feature detection in code

### Verification

1. On Android: pressing "Split stems" should produce a brief vibration.
2. On Android: split completion should produce a distinct success vibration.
3. On iOS: no errors thrown (API gracefully unavailable).
4. With `prefers-reduced-motion: reduce` — no vibration.

---

## Issue 8: No Offline Awareness or Background Processing Indication

**Priority:** P2
**Impact:** If a user locks their phone or switches apps during a long split (3–10 minutes), they have no way to know when it's done. The SSE/polling connection may also drop.

### Problem

- No push notifications or background sync.
- SSE stream disconnects when the app is backgrounded on mobile.
- No visual/audio notification when returning to the app after split completes.
- The `document.title` doesn't update with progress (mobile browsers show this in the tab switcher).

### Solution

Add passive indicators that work within browser constraints.

### Steps

1. Update `document.title` during split to show progress: `"(45%) Splitting… — Burnt Beats"`. Mobile browsers show this in the tab/app switcher.
2. When split completes while the page is hidden (`document.hidden`), play a short notification sound when the user returns (gated behind prior audio interaction).
3. Add reconnection logic to the SSE stream: if the stream drops (app backgrounded), automatically re-poll on `visibilitychange` when the page becomes visible again.
4. Show a "Welcome back — your stems are ready!" banner if split completed while away.

### Files

- `frontend/src/hooks/useStemSplitting.ts` (title updates)
- `frontend/src/api.ts` (`streamStemJobUntilDone` — reconnection on visibility change)
- `frontend/src/App.tsx` (visibility change listener)

### Tools

- Real mobile device — background/foreground the app during a split
- Chrome DevTools → Application → Service Workers (for future PWA work)

### Verification

1. Start a split, switch to another app, check the tab switcher — should show progress percentage in title.
2. Return to the app after split completes — should see "stems ready" banner.
3. If SSE dropped while backgrounded, polling should resume and catch up to current state.

---

## Issue 9: Stem Mixer Controls Too Small for Touch

**Priority:** P2
**Impact:** Volume sliders, pan knobs, and mute/solo buttons in the mixer strip are sized for mouse interaction. On mobile, they're difficult to manipulate precisely.

### Problem

The mixer uses standard `<input type="range">` sliders which, while enlarged to 8px height / 24px thumb via `@media (pointer: coarse)`, are still narrow for precise volume control. The stem strip grid goes to 1 column on mobile, which is good, but individual controls within each strip are cramped.

### Solution

Redesign the mixer strip layout for mobile with larger touch targets and a simplified control arrangement.

### Steps

1. On mobile (`pointer: coarse`), increase the volume slider thumb to 32px and track to 12px height.
2. Make mute/solo buttons full 48px × 48px with clear active states.
3. Consider a "compact mixer" mode for mobile that shows only volume + mute/solo, with an expand button for pan/width/pitch.
4. Add a horizontal swipe gesture between stems (carousel-style) as an alternative to the vertical stack.

### Files

- `frontend/src/index.css` (`@media (pointer: coarse)` section)
- `frontend/src/components/mixer-panel.component.tsx`
- `frontend/src/app/mixer-workspace.component.tsx`

### Tools

- Chrome DevTools responsive mode
- Real device testing

### Verification

1. On a phone, volume slider should be easy to grab and adjust without overshooting.
2. Mute/solo buttons should be tappable without accidentally hitting adjacent controls.
3. All mixer controls should be reachable without horizontal scrolling within a stem strip.

---

## Issue 10: Large File Exports Exhaust Mobile Device Memory

**Priority:** P1
**Impact:** Client-side WAV rendering via `OfflineAudioContext` for a 5-minute track at 44.1kHz stereo allocates ~100MB of memory. Combined with the MP3 encoding step (lamejs), this can crash mobile browser tabs.

### Problem

The `renderClientMasterWavBlob` function in `useExport.ts` renders the entire mix into an `OfflineAudioContext`, converts to WAV (another full copy in memory), then optionally encodes to MP3 (third copy). On a 5-minute track, this is:
- AudioBuffer: ~50MB
- WAV ArrayBuffer: ~50MB
- MP3 encoding buffer: ~10MB
- Total peak: ~110MB in a single tab

Mobile browsers (especially iOS Safari) aggressively kill tabs exceeding ~200–300MB.

### Solution

Implement streaming/chunked export for large files, and prefer server-side export on mobile when available.

### Steps

1. Detect available memory or device class. On mobile, if `VITE_SERVER_EXPORT_ENABLED` is set, prefer server-side export (already implemented at `POST /api/stems/server-export`).
2. For client-side export on mobile, process in chunks: render 30-second segments, encode each to MP3 incrementally, and concatenate. This keeps peak memory lower.
3. Add a warning in the Export modal when exporting WAV on mobile: "WAV files are large. MP3 is recommended for mobile devices."
4. If the export fails with an out-of-memory error, catch it gracefully and suggest MP3 or server export.

### Files

- `frontend/src/hooks/useExport.ts` (`renderClientMasterWavBlob`, `encodeWavToMp3`)
- `frontend/src/components/ExportOptionsModal.tsx` (mobile format recommendation)
- `frontend/src/api.ts` (`serverExportMasterWav` — already exists)

### Tools

- Safari Web Inspector memory profiler
- Real iOS device with limited RAM (iPhone SE)
- Performance monitor in Chrome DevTools

### Verification

1. Export a 5-minute track as MP3 on an iPhone SE — should complete without tab crash.
2. If server export is enabled, mobile should use it by default for WAV.
3. Attempting WAV export on mobile shows a recommendation to use MP3.
4. If client-side export fails due to memory, a clear error appears (not a blank white screen).

---

## Issue 11: No `viewport-fit=cover` or Safe Area Handling

**Priority:** P2
**Impact:** On iPhones with notch/Dynamic Island, the app content may be inset unnecessarily, or fixed elements may overlap the home indicator.

### Problem

The viewport meta tag is:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```
This doesn't include `viewport-fit=cover`, so the app doesn't extend into safe areas and can't use `env(safe-area-inset-*)` values.

### Solution

Add `viewport-fit=cover` and apply safe area padding where needed.

### Steps

1. Update `frontend/index.html` viewport meta:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
   ```
2. Add bottom padding to the main content area: `padding-bottom: env(safe-area-inset-bottom, 0)`.
3. Add bottom padding to fixed/sticky elements (export notification toast, waiting game tab).
4. Add top padding consideration for the Dynamic Island area.

### Files

- `frontend/index.html`
- `frontend/src/index.css`
- `frontend/src/app/editor-floating-overlays.component.tsx` (toast positioning)
- `frontend/src/app/waiting-game-panel.component.tsx` (fixed bottom-right tab)

### Tools

- Xcode Simulator with iPhone 15 Pro
- Real iPhone with notch

### Verification

1. On iPhone with notch: no content hidden behind the notch or home indicator.
2. The export success toast should not overlap the home indicator.
3. The "Waiting Game" tab in bottom-right should clear the safe area.

---

## Issue 12: Drag-and-Drop Dropzone Confusing on Mobile

**Priority:** P3
**Impact:** The upload area says "Drop your track here" which is a desktop-centric metaphor. Mobile users don't drag and drop files.

### Problem

The hero dropzone text reads:
- "Drop your track here"
- "or click to browse"

On mobile, "drop" is meaningless and "click" should be "tap."

### Solution

Show mobile-appropriate copy on touch devices.

### Steps

1. Detect touch device via `window.matchMedia('(pointer: coarse)')` or a `useIsTouchDevice()` hook.
2. On touch devices, change copy to:
   - "Tap to choose your track"
   - "MP3, WAV, FLAC, M4A"
3. Hide the drag-over visual states on touch devices (they can't trigger anyway).

### Files

- `frontend/src/components/ProcessingSettingsPanel.tsx` (dropzone hero section, ~line 290–330)
- New: `frontend/src/hooks/useIsTouchDevice.ts` (or inline media query check)

### Tools

- Chrome DevTools touch emulation

### Verification

1. On mobile: dropzone should say "Tap to choose your track" (not "Drop").
2. On desktop: existing "Drop your track here" copy remains.
3. Tapping the zone on mobile should open the file picker immediately.

---

## Implementation Priority Order

| Phase | Issues | Effort | Impact | Status |
|-------|--------|--------|--------|--------|
| **Phase 1 — Critical Path** | #1, #2, #4 | 3–5 days | Fixes broken/confusing core flow | ✅ Implemented |
| **Phase 2 — Reliability** | #3, #10, #8 | 4–6 days | Prevents failures and data loss | ✅ Implemented |
| **Phase 3 — Usability** | #5, #6, #9 | 5–8 days | Makes the app pleasant to use on mobile | ✅ Implemented |
| **Phase 4 — Polish** | #7, #11, #12 | 2–3 days | Professional mobile feel | ✅ Implemented |

---

## Testing Strategy

### Device Matrix

| Device | OS | Browser | Screen | Priority |
|--------|-----|---------|--------|----------|
| iPhone SE (3rd gen) | iOS 17+ | Safari | 375×667 | High (smallest common) |
| iPhone 15 Pro | iOS 17+ | Safari | 393×852 | High (notch/Dynamic Island) |
| Samsung Galaxy S23 | Android 14 | Chrome | 360×780 | High (popular Android) |
| Pixel 7 | Android 14 | Chrome | 412×915 | Medium |
| iPad Mini | iPadOS 17 | Safari | 744×1133 | Medium (tablet edge case) |

### Test Scenarios

1. **Upload flow**: Select file from Files app, camera roll, cloud storage (Google Drive, iCloud)
2. **Long upload on cellular**: 100MB file on 4G — verify progress and resilience
3. **Split with app backgrounded**: Start split, switch apps, return after 5 minutes
4. **Export on low memory**: Export 5-minute track on iPhone SE
5. **Waveform interaction**: Trim, seek, zoom on phone screen
6. **Modal interaction**: Open export modal, interact with keyboard open
7. **Orientation change**: Rotate phone during split/export — no layout break

### Automated Testing

- Add Playwright mobile viewport tests for critical flows
- Add `@media (pointer: coarse)` visual regression tests
- Add network throttling tests for upload progress

---

## Dependencies and Risks

| Risk | Mitigation |
|------|-----------|
| iOS Safari download behavior changes between versions | Test on latest 2 iOS versions; implement Web Share API as primary path |
| `navigator.vibrate()` not available on iOS | Feature-detect and skip gracefully |
| `100dvh` not supported on older browsers | Use fallback: `100vh` then `100dvh` (progressive enhancement) |
| Pinch-to-zoom conflicts with browser zoom | Use `touch-action: none` on waveform container only |
| Server export not always enabled | Fall back to client-side with memory warning |

---

## Success Metrics

- **Upload success rate on mobile** increases (track via analytics event `split_started` vs `track_upload_selected`)
- **Export completion rate on mobile** increases (track `export_completed` events by device type)
- **Error rate for "file too large" or format errors** decreases on mobile
- **Time-to-first-interaction** on mobile remains under 3 seconds
- **No increase in tab crash reports** (monitor via `window.onerror` or error boundary)
