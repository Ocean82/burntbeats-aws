 [MultiStemEditor.tsx]
***
## ✅ 1) Definite compile errors (fix these first)
### A) `playingStemId` prop type is broken
In `MultiStemEditorProps` you have:
```ts
playingStemId: string \
 null;
```
That backslash is not valid TypeScript. It should be:
```ts
playingStemId: string | null;
```
This will currently fail to compile. 
***
### B) `dragging` ref union type is broken
In 
```ts
const dragging = useRef<"start" \
 "end" \
 "seek" \
 null>(null);
```
Same issue: those backslashes should be union separators. Fix to:
```ts
const dragging = useRef<"start" | "end" | "seek" | null>(null);
```
Again: compile failure as-is. 
> **Pattern:** your earlier [WaveformEditor.tsx] also had broken operators/line continuations (e.g., `isPlaying \ currentPosition > 0`). This suggests a formatting/escaping step is corrupting `|` and `&&` into `\` + newlines. If you have a codegen step, markdown export, or copy pipeline, that’s worth checking.
***
## ⚠️ 2) Timeline math: slice bounds can overshoot (zoom + scroll)
Inside `WaveformLane` you compute:
````ts
const visibleStart = scrollPct / 100;
const visibleEnd = visibleStart + 1 / zoom;
const startBin = Math.floor(visibleStart * waveform.length);
const endBin = Math.ceil(visibleEnd * waveform.length);
const slice = waveform.slice(startBin, endBin);
Even though your scroll slider uses `max={100 - 100 / zoom}`, `visibleEnd` can still land slightly > 1.0 due to rounding and step size, and then `endBin` can exceed `waveform.length`.
**Fix:** clamp `visibleEnd` and clamp bins:
```ts
const visibleStart = scrollPct / 100;
const visibleEnd = Math.min(1, visibleStart + 1 / zoom);
const startBin = clamp(Math.floor(visibleStart * waveform.length), 0, waveform.length);
const endBin = clamp(Math.ceil(visibleEnd * waveform.length), startBin, waveform.length);
const slice = waveform.slice(startBin, endBin);
````
This avoids occasional empty slices / weird jitter at the far right edge. 
***
## ⚠️ 3) Scroll needs clamping when zoom changes
You allow zooming in/out:
```ts
onClick={() => setZoom((z) => Math.max(1, z / 1.5))}
onClick={() => setZoom((z) => Math.min(8, z * 1.5))}
```
But `scrollPct` remains whatever it was. If the user is zoomed in and scrolled near the end, then zooms back out, `scrollPct` can be **outside the new valid range** (`0..100 - 100/zoom`). 
**Add an effect to clamp scroll when zoom changes:**
```ts
useEffect(() => {
  const maxScroll = Math.max(0, 100 - 100 / zoom);
  setScrollPct((s) => clamp(s, 0, maxScroll));
}, [zoom]);
```
This prevents “blank area” / confusing ruler values after zooming. 
***
## ⚠️ 4) Click/drag interaction conflict: selecting stem while trimming/scrubbing
You wrap each lane in a clickable div:
````tsx
<div key={s.id} onClick={() => setActiveStemId(s.id)} className="cursor-pointer">
  <WaveformLane ... />
</div>
But `WaveformLane` uses `onMouseDown` for trim/seek. That means a drag can still trigger the parent `onClick` (mouseup ends up firing click) and unexpectedly change the active stem while editing.
**Fix:** stop propagation on lane mouse down (or in parent click handler, ignore if dragging). Easiest:
```ts
const onMouseDown = useCallback((e: React.MouseEvent) => {
  e.stopPropagation();
  ...
}, [...]);
````
This makes trimming/scrubbing feel much more stable. 
***
## ⚡ 5) Performance: thousands of DOM nodes across lanes
Each lane renders one `<span>` per waveform bin in the visible slice:
````tsx
{slice.map((v, i) => (
  <span key={i} className="flex-1 rounded-full" style={{ height: `${Math.max(8, v * 90)}%`, ... }} />
))}
With multiple stems and zoomed-out views, this can create a lot of DOM. A few improvements:
### A) Use stable keys (prevents unnecessary re-mounting)
Right now `key={i}` resets as the slice window changes. Prefer:
```ts
key={startBin + i}
````
(You already have `startBin` computed.) 
### B) Clamp bar height to 100%
If waveform values can exceed 1, your height can exceed 100%. Safer:
```ts
const h = clamp(v, 0, 1) * 90;
height: `${Math.max(8, h)}%`
```
### C) Downsample to a fixed number of bars per lane
Instead of rendering every sample, map the slice into e.g. 200 bars max (take max/avg per bucket). This improves performance dramatically and still looks great.
***
## 🎛️ 6) Audio semantics: “rate affects pitch + tempo together” — ensure UI communicates that
Your state says:
````ts
/** Playback rate: 0.5–2.0. 1.0 = normal. Affects pitch + tempo together. */
rate: number;
But the control label is “Speed / Pitch” and it’s a single slider. That’s fine, but users often interpret pitch as independent (time-stretch). Consider:
- label it “Speed (changes pitch)” or
- add a tooltip so expectations match the implementation
This is a UX improvement, not a correctness issue. 
---
## 🧭 7) Small correctness/robustness improvements
### A) `pctFromEvent` mapping is solid — but guard against zero width
You do:
```ts
const raw = (e.clientX - rect.left) / rect.width;
If width is 0 (rare, but can happen during transitions/layout), you’ll get `Infinity`. Add:
```ts
if (!rect || rect.width <= 0) return 0;
````
### B) Trim minimum gap is duplicated (“2” and “4”)
You decide which handle to drag with `distStart < 4` and enforce minimum gap `2`.   
Consider constants:
```ts
const HANDLE_HIT_PCT = 4;
const MIN_TRIM_GAP_PCT = 2;
```
This improves readability and makes tuning easier.
### C) Placeholder waveform is constant
When no waveform exists:
````ts
Array(WAVEFORM_BINS).fill(0.15)
```
This can visually imply audio exists when it doesn’t. Alternative: fill with 0 or show “No waveform loaded” style, or use a subtle diagonal hatch.
---
## ♿ 8) Accessibility quick wins
A few places to improve accessibility:
- Buttons and sliders should have `aria-label` (especially icon buttons in the zoom control).  
- The waveform lane interaction (drag to trim/seek) isn’t keyboard accessible; consider optional keyboard shortcuts when lane is focused.
Not required for functionality, but it’s a big quality boost.
---
# Top 3 “do now” fixes (highest impact)
1) Fix the **TypeScript union syntax** (`string | null`, `"start" | "end" | ...`).  
2) Clamp **scroll when zoom changes** and clamp `visibleEnd` / bin bounds to prevent edge glitches.  
3) Prevent **parent click** from firing while trimming/scrubbing (`stopPropagation`).  
````
 **full-length songs + 2–4 stems** is a *great* spot: you can keep the UI rich (trim handles, scrub, zoom) without needing heavy virtualization, but you **do** want to be careful about (a) playhead update frequency and (b) waveform rendering scale.
Below are the **best improvements for your exact use case**, using your current 
***
## The #1 risk for full songs: playhead updates causing rerenders
For full tracks, `playheadPct` usually updates **many times per second**. Right now, `playheadPct` is passed into every `WaveformLane`, and each lane computes `playheadVis` and conditionally renders the playhead div. 
### Improvement: render playhead as a separate overlay (or update via ref/CSS var)
**Goal:** the waveform bars should *not* rerender at audio tick rate.
Two easy patterns:
#### Option A — Single global playhead overlay (recommended)
*   Put one playhead line over the whole lanes container.
*   Compute its position once using `zoom` + `scrollPct` mapping.
*   Waveform lanes rerender only when zoom/scroll/trim changes, not playhead ticks.
This is a big win with essentially no UX downside because playhead position is global anyway.
#### Option B — Keep per-lane playhead but update via `ref` (no React rerender)
Inside `WaveformLane`, keep a `ref` to the playhead element and update `style.left` in an effect driven by `playheadPct`. That still runs frequently, but avoids React diffing thousands of spans.
***
## DOM waveform is fine for 2–4 stems *if you cap bars*
Your lanes render a `<span>` for each bin in `slice`.   
If `waveform.length` is modest (e.g., 512 like your placeholder `WAVEFORM_BINS`), you’re fine even at zoom=1.   
But for full songs you may eventually generate more bins (2k–16k). At zoom=1 that becomes expensive. 
### Improvement: Downsample slice to a fixed bar budget
Pick a display budget like 300–800 bars (per lane) and compress any larger slice into that many bars (max or RMS per bucket). It keeps the look consistent and performance stable.
Conceptually:
*   If `slice.length <= BAR_BUDGET` → render as is.
*   Else → bucket `slice` into `BAR_BUDGET` groups and take max/avg.
This also makes zoom feel smoother.
**Bonus:** For keys, use `startBin + i` rather than `i` so React doesn’t remount all bars when you scroll. Right now it’s `key={i}`. 
***
## Fix edge behavior: clamp visible range and scroll on zoom changes
You already map visible window like this in `WaveformLane`:  
`visibleStart = scrollPct/100`, `visibleEnd = visibleStart + 1/zoom`, then slice waveform bins.
### Two targeted robustness fixes:
1.  **Clamp `visibleEnd` to ≤ 1** to avoid end-of-track glitches:
```ts
const visibleEnd = Math.min(1, visibleStart + 1 / zoom);
```
2.  **Clamp `scrollPct` when zoom changes** so it remains valid for the new zoom:
    Your scroll slider max is `100 - 100/zoom`, but when zoom changes, `scrollPct` may now be out of range.   
    Add:
```ts
useEffect(() => {
  const maxScroll = Math.max(0, 100 - 100 / zoom);
  setScrollPct((s) => clamp(s, 0, maxScroll));
}, [zoom]);
```
***
## Prevent accidental stem selection while trimming/scrubbing
Right now each lane is wrapped in a clickable container that sets the active stem: 
```tsx
<div onClick={() => setActiveStemId(s.id)} ...>
  <WaveformLane ... />
</div>
```
But `WaveformLane` uses `onMouseDown` to start drag interactions.   
This commonly results in: user drags trim → mouseup triggers click → active stem changes unintentionally. 
### Fix: stop propagation in `WaveformLane`’s mouse down
```ts
const onMouseDown = useCallback((e: React.MouseEvent) => {
  e.stopPropagation();
  ...
}, [...]);
```
This is one of those “feels instantly better” fixes.
***
## Make trim + handle hit testing feel better for songs
You detect handle selection with:
*   handle “hit” if within 4% of start/end
*   minimum trim gap enforced at 2%    
For full songs, **percent-based hit areas** can get awkward (4% of a 5-minute track is a huge region). Consider switching handle hit testing to **pixels**, not percent:
*   Compute distance in pixels from handle positions using the lane rect width.
*   This gives consistent ergonomics at any zoom.
Same for minimum trim gap: better as seconds or samples (depending on your audio engine), but even a pixel-based minimum is an improvement.
***
## Small but important: fix the TypeScript union syntax corruption
Your file currently has literal backslashes where union types should be:
*   `playingStemId: string \ null;` 
*   `useRef<"start" \ "end" \ "seek" \ null>` 
These must be `|` unions or the file won’t compile.
This looks like an encoding/formatting artifact (similar issue appeared in your other file earlier), so it may be worth checking any step that transforms code before it lands in your repo (copy/paste via certain editors, markdown conversion, etc.).
***
# Recommended “best-fit” approach for your scenario (full songs, 2–4 stems)
✅ **Keep DOM bars** (simple, stylable, fine for 2–4 lanes)  
✅ Add **downsampling to a fixed bar budget** (prevents huge DOM)  
✅ Render **one global playhead overlay** or update playhead via **ref** (prevents rerenders every tick)  
✅ Clamp **scroll on zoom change** + clamp `visibleEnd` (prevents edge glitches)  
✅ Stop click propagation during drag (prevents accidental stem switching)
This combination will keep it smooth even for full-length songs, without needing canvas or virtualization.
***