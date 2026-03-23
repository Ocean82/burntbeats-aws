let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.08) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // silently fail if audio isn't available
  }
}

export const sounds = {
  move: () => playTone(200, 0.05, 'square', 0.04),
  rotate: () => playTone(300, 0.08, 'square', 0.05),
  drop: () => playTone(150, 0.15, 'triangle', 0.06),
  lock: () => playTone(100, 0.1, 'triangle', 0.05),
  lineClear: () => {
    playTone(523, 0.1, 'square', 0.06);
    setTimeout(() => playTone(659, 0.1, 'square', 0.06), 80);
    setTimeout(() => playTone(784, 0.15, 'square', 0.06), 160);
  },
  tetris: () => {
    playTone(523, 0.1, 'square', 0.07);
    setTimeout(() => playTone(659, 0.1, 'square', 0.07), 100);
    setTimeout(() => playTone(784, 0.1, 'square', 0.07), 200);
    setTimeout(() => playTone(1047, 0.2, 'square', 0.07), 300);
  },
  gameOver: () => {
    playTone(400, 0.2, 'sawtooth', 0.06);
    setTimeout(() => playTone(300, 0.2, 'sawtooth', 0.06), 200);
    setTimeout(() => playTone(200, 0.4, 'sawtooth', 0.06), 400);
  },
  levelUp: () => {
    [523, 587, 659, 784, 880, 1047].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.1, 'square', 0.06), i * 60);
    });
  },
  konami: () => {
    const notes = [659, 659, 0, 659, 0, 523, 659, 0, 784];
    notes.forEach((f, i) => {
      if (f > 0) setTimeout(() => playTone(f, 0.12, 'square', 0.07), i * 120);
    });
  },
};
