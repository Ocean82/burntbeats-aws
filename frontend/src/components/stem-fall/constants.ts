export const BOARD_WIDTH = 16;
export const BOARD_HEIGHT = 23;
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
    "i thought you would be better than this.",
    "that's one in a row for you.",
    "one at a time, champ.",
    "slow and steady wins nothing.",
    "participation trophy unlocked 🏆",
  ],
  2: [
    "double drop!",
    "are you even trying?",
    "two-fer!",
    "look at you, overachiever.",
    "doing the bare minimum x2",
  ],
  3: [
    "TRIPLE! 🔥",
    "hat trick!",
    "okay okay I see you",
    "your stems would be proud",
    "Still not good enough to get that pony you always wanted",
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
  "Relax, this won't take long... and you won't remember a thing",
  "downloading more RAM...",
  "asking the AI to hurry up...",
  "Follow the white rabbit... 🐇",
  "untangling the frequency cables...",
  "bribing the server with cookies 🍪",
  "have you tried turning it off and on again?",
  "loading the loading screen...",
  "contemplating the meaning of life...",
  "negotiating with the stem splitter...",
  "warming up the tacos ☁️🔥",
  "teaching the AI to be patient...",
  "you have the look of someone who accepts that they sees... because you're expecting to wake up!",
  "on hold with tech support...",
  "it's not a bug, it's a loading feature",
  "insert coin to continue... jk it's working",
  "You take the red pill, you stay in Wonderland, and I show you how deep the rabbit hole goes.",
  "the shipment got stuck in traffic 🚗",
  "your stems are in another castle 🏰",
  "deploying carrier pigeons 🐦",
  "spinning up the flux capacitor...",
];

export const GAME_OVER_MESSAGES = [
  "F",
  "If you were better this wouldn't have happened",
  "gg no re",
  "that was... something.",
  "your score has been reported to the authorities",
  "the blocks won this round",
  "skill issue tbh",
  "You would never survive the Hunger Games",
  "you're not the main character",
  "you probably thought this was about actual stems",
  "you can't handle the truth",
  "you're about as useful as a screen door on a submarine",
  "you really dropped the ball here",
  "did you even try?",
  "you've clearly hit rock bottom",
  "are you even trying?",
  "maybe try again in a few centuries",
  "did you forget how to play?",
  "you're the reason we can't have nice things",
  "your parents are disappointed",
  "your cat hates you",
  "your browser history is a crime scene",
  "you've peaked",
  "you're going to need a bigger boat",
  "i've seen toddlers with better reflexes",
  "you're about as fast as a sloth on tranquilizers",
  "your high score is now negative",
  "the code has spoken, and it says 'you lose'",
  "this is your sign to go outside",
  "your life flashing before your eyes... it wasn't impressive",
  
  ];
  // Konami code sequence
export const KONAMI_CODE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
];
