let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioCtx;
}

// Squeaky: high-freq sine with a quick pitch bend upward
function squeak(freq: number, duration: number, volume = 0.07) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    // Start at freq, bend up slightly for that rubber-duck squeak
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(freq * 1.35, ctx.currentTime + duration * 0.3);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.8, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // silently fail
  }
}

// Short chirp for quick actions
function chirp(freq: number, duration: number, volume = 0.05) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq * 1.5, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // silently fail
  }
}

export const sounds = {
  move:     () => chirp(1200, 0.04, 0.04),
  rotate:   () => squeak(1600, 0.07, 0.05),
  drop:     () => squeak(900, 0.12, 0.06),
  lock:     () => chirp(700, 0.09, 0.05),
  lineClear: () => {
    squeak(1400, 0.08, 0.06);
    setTimeout(() => squeak(1800, 0.08, 0.06), 80);
    setTimeout(() => squeak(2200, 0.12, 0.06), 160);
  },
  stemFall: () => {
    // 4-line clear — ascending squeaky fanfare
    squeak(1400, 0.08, 0.07);
    setTimeout(() => squeak(1800, 0.08, 0.07), 90);
    setTimeout(() => squeak(2200, 0.08, 0.07), 180);
    setTimeout(() => squeak(2800, 0.18, 0.08), 270);
  },
  gameOver: () => {
    squeak(800, 0.18, 0.06);
    setTimeout(() => squeak(600, 0.18, 0.06), 200);
    setTimeout(() => squeak(400, 0.35, 0.06), 400);
  },
  levelUp: () => {
    [1200, 1400, 1600, 1900, 2200, 2600].forEach((f, i) => {
      setTimeout(() => squeak(f, 0.09, 0.06), i * 55);
    });
  },
  konami: () => {
    const notes = [1800, 1800, 0, 1800, 0, 1400, 1800, 0, 2200];
    notes.forEach((f, i) => {
      if (f > 0) setTimeout(() => squeak(f, 0.1, 0.07), i * 110);
    });
  },
};
