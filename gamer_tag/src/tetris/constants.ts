export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const CELL_SIZE = 28;

// Standard 7 tetrominoes
export const PIECES = [
  // I
  { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: 1 },
  // O
  { shape: [[1,1],[1,1]], color: 2 },
  // T
  { shape: [[0,1,0],[1,1,1],[0,0,0]], color: 3 },
  // S
  { shape: [[0,1,1],[1,1,0],[0,0,0]], color: 4 },
  // Z
  { shape: [[1,1,0],[0,1,1],[0,0,0]], color: 5 },
  // J
  { shape: [[1,0,0],[1,1,1],[0,0,0]], color: 6 },
  // L
  { shape: [[0,0,1],[1,1,1],[0,0,0]], color: 7 },
];

export const COLORS: Record<number, string> = {
  0: 'transparent',
  1: '#00f0f0', // cyan - I
  2: '#f0f000', // yellow - O
  3: '#a000f0', // purple - T
  4: '#00f000', // green - S
  5: '#f00000', // red - Z
  6: '#0000f0', // blue - J
  7: '#f0a000', // orange - L
  8: 'rgba(255,255,255,0.08)', // ghost
  9: '#FFD700', // gold - easter egg
};

export const LEVEL_SPEEDS = [
  800, 720, 630, 550, 470, 380, 300, 220, 140, 100,
  80, 80, 80, 70, 70, 70, 50, 50, 50, 30,
];

export const SCORE_TABLE: Record<number, number> = {
  1: 100,
  2: 300,
  3: 500,
  4: 800, // TETRIS!
};

// Easter egg messages
export const LINE_CLEAR_MESSAGES: Record<number, string[]> = {
  1: [
    "nice.",
    "one at a time, champ.",
    "slow and steady wins nothing.",
    "participation trophy unlocked 🏆",
  ],
  2: [
    "double trouble!",
    "two-fer!",
    "look at you, overachiever.",
    "doing the bare minimum x2",
  ],
  3: [
    "TRIPLE! 🔥",
    "hat trick!",
    "okay okay I see you",
    "your mom would be proud",
  ],
  4: [
    "T E T R I S ! ! ! 🎉",
    "BOOM! absolute legend!",
    "they said it couldn't be done",
    "somebody call the fire dept 🔥🔥🔥",
    "you're basically a NASA engineer now",
  ],
};

export const IDLE_MESSAGES = [
  "still loading... play some tetris!",
  "the hamsters are running as fast as they can 🐹",
  "reticulating splines...",
  "downloading more RAM...",
  "asking ChatGPT to hurry up...",
  "untangling the internet cables...",
  "bribing the server with cookies 🍪",
  "have you tried turning it off and on again?",
  "loading loading screen...",
  "contemplating the meaning of async/await...",
  "negotiating with the database...",
  "warming up the cloud ☁️🔥",
  "teaching the AI to be patient...",
  "on hold with tech support...",
  "it's not a bug, it's a loading feature",
  "insert coin to continue... jk it's free",
  "the bits are stuck in traffic 🚗",
  "your data is in another castle 🏰",
  "deploying carrier pigeons 🐦",
  "spinning up the flux capacitor...",
];

export const GAME_OVER_MESSAGES = [
  "F",
  "gg no re",
  "that was... something.",
  "your highscore has been reported to the authorities",
  "the blocks won this round",
  "skill issue tbh",
  "have you considered... not losing?",
  "press start to try again (it won't help)",
  "the loading screen outlived you",
];

export const KONAMI_CODE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
];
