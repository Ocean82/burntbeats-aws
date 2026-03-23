
---

### Phase 2 — Critical impact, medium difficulty

Two parallel tracks are fine (frontend vs backend).

| Track | Work | Source | Notes |
|-------|------|--------|--------|
| **2A** | **`useAudioEngine.ts`** integration | `stem-splitter-mixer-interface` | Replace/merge with `useAudioPlayback` + `useStemAudio` / `useMixerWorkspace`: real EQ, dynamics, reverb, delay, master chain. Wire Phase 1.7 + meters to live nodes. |
| **2B** | **Server mix + master + export** | `BURNT-BEATS` `mix_master.py` | Implement **`POST /api/stems/server-export`** (remove **501** path in `backend/server.py`), align job paths with `stem_service` + S3; charge usage tokens per `docs/BILLING-AND-TOKENS.md` when wired. |
| **2C** (optional) | **Richer mastering / MP3** | `D:\waveform\audio_mixer.py` | Pull in LUFS/FFmpeg/export pieces after 2B baseline works. |

**Exit criteria for Phase 2:** Mixer controls audibly affect stems; optional server master export downloadable end-to-end.

---

### Phase 3 — High impact, medium to medium-high difficulty

Order flexibly by product priority (UX vs ops vs models).

| Step | Work | Source | Difficulty |
|------|------|--------|------------|
| 3.1 | **`TransportBar.tsx`** (BPM, loop, metronome as product allows) | `BEATS-DAW2-works` | Medium |
| 3.2 | **`Timeline.tsx`** + arrangement data model | `BEATS-DAW2-works` | Med–High |
| 3.3 | **`cloudformation.yaml`** production stack | `daw3` | Medium (parameterize account/domain) |
| 3.4 | **`two_stem_onnx.py` ideas** merged into pipeline | `BURNT-BEATS` | Medium |
| 3.5 | **`schema.prisma` + persistence API** | `BEATS-DAW2-works` | **High** — new DB, migrations, auth-bound projects |

**Exit criteria for Phase 3:** DAW-like transport/timeline usable; deploy story stronger; ONNX robustness improved; optional DB-backed projects if committed.

---

### Phase 4 — Re-evaluation gate (before “heavy” backlog)

Stop and **re-assess scope, metrics, and maintenance cost** before Phase 5. Decide whether to schedule, split, or drop items below.

Candidates for this gate:

- **`VisualTuner.tsx`** (medium impact, low–medium difficulty — may be pulled *before* Phase 5 if product wants it).
- **MIDI effects spec** (`MIDI_EFFECTS.md`) — implementation still **high** effort.
- **Music demixing challenge kit** — benchmarking / evaluation only.
- **`schema.prisma`** if deferred from 3.5.

---

### Phase 5 — Low impact × high difficulty (last; re-evaluate required)

Do **not** start until Phase 4 sign-off. These are the best fit for “expensive for what you get” *unless* product strategy changes.

| Item | Source | Why last |
|------|--------|----------|
| **`AutomationLanes.tsx`** + playback automation | `DAW1` | Medium product value vs large engine + scheduling work. |
| **Full MIDI effects implementation** | `BEATS-DAW2-works` docs + new code | High effort; stem-first product may not need it soon. |
| **Deep `demucs/models/` fork** | `D:\DAW Collection\demucs` | Low–medium value unless customizing separation; integration **high**. |

