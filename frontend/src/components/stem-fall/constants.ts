export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const CELL_SIZE = 26;

// 7 falling pieces — stem-themed names
export const PIECES = [
  // I — "The Long Drop"
  { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: 1 },
  // O — "The Block"
  { shape: [[1,1],[1,1]], color: 2 },
  // T — "The T-Pain"
  { shape: [[0,1,0],[1,1,1],[0,0,0]], color: 3 },
  // S — "The Slide"
  { shape: [[0,1,1],[1,1,0],[0,0,0]], color: 4 },
  // Z — "The Zap"
  { shape: [[1,1,0],[0,1,1],[0,0,0]], color: 5 },
  // J — "The Bass Drop"
  { shape: [[1,0,0],[1,1,1],[0,0,0]], color: 6 },
  // L — "The Hook"
  { shape: [[0,0,1],[1,1,1],[0,0,0]], color: 7 },
];

// Fire/amber palette to match Burnt Beats
export const COLORS: Record<number, string> = {
  0: 'transparent',
  1: '#ff6b35', // orange — I
  2: '#ffbb61', // amber — O
  3: '#ff3d71', // pink — T
  4: '#00d4aa', // teal — S
  5: '#a855f7', // purple — Z
  6: '#3b82f6', // blue — J
  7: '#f59e0b', // gold — L
  8: 'rgba(255,255,255,0.06)', // ghost
  9: '#FFD700', // gold — easter egg
};

export const LEVEL_SPEEDS = [
  800, 720, 630, 550, 470, 380, 300, 220, 140, 100,
  80, 80, 80, 70, 70, 70, 50, 50, 50, 30,
];

export const SCORE_TABLE: Record<number, number> = {
  1: 100,
  2: 300,
  3: 500,
  4: 800,
};

export const LINE_CLEAR_MESSAGES: Record<number, string[]> = {
  1: [
    "nice.",
    "one at a time, champ.",
    "slow and steady wins nothing.",
    "participation trophy unlocked 🏆",
  ],
  2: [
    "double drop!",
    "two-fer!",
    "look at you, overachiever.",
    "doing the bare minimum x2",
  ],
  3: [
    "TRIPLE! 🔥",
    "hat trick!",
    "okay okay I see you",
    "your stems would be proud",
  ],
  4: [
    "STEM FALL! 🎉",
    "BOOM! absolute legend!",
    "they said it couldn't be done",
    "somebody call the fire dept 🔥🔥🔥",
    "you're basically a sound engineer now",
  ],
};

export const IDLE_MESSAGES = [
  "stems are separating... drop some blocks!",
  "the hamsters are running as fast as they can 🐹",
  "reticulating audio waveforms...",
  "downloading more RAM...",
  "asking the AI to hurry up...",
  "untangling the frequency cables...",
  "bribing the server with cookies 🍪",
  "have you tried turning it off and on again?",
  "loading the loading screen...",
  "contemplating the meaning of async/await...",
  "negotiating with the stem splitter...",
  "warming up the cloud ☁️🔥",
  "teaching the AI to be patient...",
  "on hold with tech support...",
  "it's not a bug, it's a loading feature",
  "insert coin to continue... jk it's free",
  "the bits are stuck in traffic 🚗",
  "your stems are in another castle 🏰",
  "deploying carrier pigeons 🐦",
  "spinning up the flux capacitor...",
];

export const GAME_OVER_MESSAGES = [
  "F",
  "gg no re",
  "that was... something.",
  "your score has been reported to the authorities",
  "the blocks won this round",
  "skill issue tbh",
  "have you considered... not losing?",
  "press start to try again (it won't help)",
  "the stems outlived you",
];

export const KONAMI_CODE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
];
