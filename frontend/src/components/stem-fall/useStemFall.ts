import { useState, useCallback, useRef, useEffect } from 'react';
import type { Board, Piece, GameState, Position } from './types';
import {
  BOARD_WIDTH, BOARD_HEIGHT, PIECES, LEVEL_SPEEDS,
  SCORE_TABLE, LINE_CLEAR_MESSAGES, GAME_OVER_MESSAGES,
  KONAMI_CODE,
} from './constants';
import { sounds } from './sounds';

function createBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));
}

function randomPiece(): Piece {
  const p = PIECES[Math.floor(Math.random() * PIECES.length)];
  return {
    shape: p.shape.map(row => [...row]),
    color: p.color,
    pos: { x: Math.floor((BOARD_WIDTH - p.shape[0].length) / 2), y: 0 },
  };
}

function rotate(shape: number[][]): number[][] {
  const size = shape.length;
  const rotated: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      rotated[x][size - 1 - y] = shape[y][x];
    }
  }
  return rotated;
}

function collides(board: Board, shape: number[][], pos: Position): boolean {
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x]) {
        const bx = pos.x + x;
        const by = pos.y + y;
        if (bx < 0 || bx >= BOARD_WIDTH || by >= BOARD_HEIGHT) return true;
        if (by >= 0 && board[by][bx] !== 0) return true;
      }
    }
  }
  return false;
}

function getGhostY(board: Board, piece: Piece): number {
  let ghostY = piece.pos.y;
  while (!collides(board, piece.shape, { x: piece.pos.x, y: ghostY + 1 })) {
    ghostY++;
  }
  return ghostY;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function useStemFall() {
  const [state, setState] = useState<GameState>({
    board: createBoard(),
    currentPiece: null,
    nextPiece: null,
    score: 0,
    lines: 0,
    level: 0,
    gameOver: false,
    paused: false,
    started: false,
    message: '',
    comboCount: 0,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const konamiRef = useRef<string[]>([]);
  const konamiActiveRef = useRef(false);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = useCallback((msg: string, duration = 2000) => {
    setState(s => ({ ...s, message: msg }));
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    messageTimerRef.current = setTimeout(() => {
      setState(s => ({ ...s, message: '' }));
    }, duration);
  }, []);

  const lockPiece = useCallback(() => {
    const s = stateRef.current;
    if (!s.currentPiece) return;

    const newBoard = s.board.map(row => [...row]);
    const piece = s.currentPiece;

    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const by = piece.pos.y + y;
          const bx = piece.pos.x + x;
          if (by >= 0 && by < BOARD_HEIGHT && bx >= 0 && bx < BOARD_WIDTH) {
            newBoard[by][bx] = piece.color;
          }
        }
      }
    }

    const completedLines: number[] = [];
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      if (newBoard[y].every(cell => cell !== 0)) completedLines.push(y);
    }

    let clearedBoard = newBoard;
    if (completedLines.length > 0) {
      clearedBoard = newBoard.filter((_, i) => !completedLines.includes(i));
      while (clearedBoard.length < BOARD_HEIGHT) {
        clearedBoard.unshift(Array(BOARD_WIDTH).fill(0));
      }
    }

    const newLines = s.lines + completedLines.length;
    const newLevel = Math.floor(newLines / 10);
    const lineScore = SCORE_TABLE[completedLines.length] || 0;
    const newCombo = completedLines.length > 0 ? s.comboCount + 1 : 0;
    const comboBonus = completedLines.length > 0 && s.comboCount > 0 ? s.comboCount * 50 : 0;
    const newScore = s.score + lineScore * (s.level + 1) + comboBonus;

    if (completedLines.length === 4) {
      sounds.stemFall();
    } else if (completedLines.length > 0) {
      sounds.lineClear();
    } else {
      sounds.lock();
    }

    if (completedLines.length > 0) {
      const msgs = LINE_CLEAR_MESSAGES[completedLines.length] || LINE_CLEAR_MESSAGES[1];
      showMessage(pickRandom(msgs!));
    }

    if (newLevel > s.level && completedLines.length > 0) {
      sounds.levelUp();
      showMessage(`LEVEL ${newLevel}! 🚀`, 2500);
    }

    if (newCombo >= 3) showMessage(`${newCombo}x COMBO! 🔥🔥🔥`);

    if (newScore >= 10000 && s.score < 10000) {
      showMessage("10K CLUB! you're basically a sound engineer now 😎", 3000);
    }
    if (newScore >= 42069 && s.score < 42069) {
      showMessage("nice score 😏", 3000);
    }

    const nextPiece = s.nextPiece || randomPiece();
    const spawnPiece = randomPiece();

    if (collides(clearedBoard, nextPiece.shape, nextPiece.pos)) {
      sounds.gameOver();
      setState(prev => ({
        ...prev,
        board: clearedBoard,
        currentPiece: null,
        nextPiece: null,
        score: newScore,
        lines: newLines,
        level: newLevel,
        gameOver: true,
        comboCount: 0,
        message: pickRandom(GAME_OVER_MESSAGES),
      }));
      return;
    }

    setState(prev => ({
      ...prev,
      board: clearedBoard,
      currentPiece: { ...nextPiece, pos: { x: Math.floor((BOARD_WIDTH - nextPiece.shape[0].length) / 2), y: 0 } },
      nextPiece: spawnPiece,
      score: newScore,
      lines: newLines,
      level: newLevel,
      comboCount: newCombo,
    }));
  }, [showMessage]);

  const moveDown = useCallback(() => {
    const s = stateRef.current;
    if (!s.currentPiece || s.gameOver || s.paused) return;
    const newPos = { x: s.currentPiece.pos.x, y: s.currentPiece.pos.y + 1 };
    if (collides(s.board, s.currentPiece.shape, newPos)) {
      lockPiece();
    } else {
      setState(prev => ({
        ...prev,
        currentPiece: prev.currentPiece ? { ...prev.currentPiece, pos: newPos } : null,
      }));
    }
  }, [lockPiece]);

  const tick = useCallback(() => {
    moveDown();
    const s = stateRef.current;
    const speed = LEVEL_SPEEDS[Math.min(s.level, LEVEL_SPEEDS.length - 1)];
    timerRef.current = setTimeout(tick, speed);
  }, [moveDown]);

  const startGame = useCallback(() => {
    const first = randomPiece();
    const next = randomPiece();
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({
      board: createBoard(),
      currentPiece: first,
      nextPiece: next,
      score: 0,
      lines: 0,
      level: 0,
      gameOver: false,
      paused: false,
      started: true,
      message: '',
      comboCount: 0,
    });
    timerRef.current = setTimeout(tick, LEVEL_SPEEDS[0]);
  }, [tick]);

  const moveLeft = useCallback(() => {
    const s = stateRef.current;
    if (!s.currentPiece || s.gameOver || s.paused) return;
    const newPos = { x: s.currentPiece.pos.x - 1, y: s.currentPiece.pos.y };
    if (!collides(s.board, s.currentPiece.shape, newPos)) {
      sounds.move();
      setState(prev => ({
        ...prev,
        currentPiece: prev.currentPiece ? { ...prev.currentPiece, pos: newPos } : null,
      }));
    }
  }, []);

  const moveRight = useCallback(() => {
    const s = stateRef.current;
    if (!s.currentPiece || s.gameOver || s.paused) return;
    const newPos = { x: s.currentPiece.pos.x + 1, y: s.currentPiece.pos.y };
    if (!collides(s.board, s.currentPiece.shape, newPos)) {
      sounds.move();
      setState(prev => ({
        ...prev,
        currentPiece: prev.currentPiece ? { ...prev.currentPiece, pos: newPos } : null,
      }));
    }
  }, []);

  const rotatePiece = useCallback(() => {
    const s = stateRef.current;
    if (!s.currentPiece || s.gameOver || s.paused) return;
    const rotated = rotate(s.currentPiece.shape);
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      const newPos = { x: s.currentPiece.pos.x + kick, y: s.currentPiece.pos.y };
      if (!collides(s.board, rotated, newPos)) {
        sounds.rotate();
        setState(prev => ({
          ...prev,
          currentPiece: prev.currentPiece ? { ...prev.currentPiece, shape: rotated, pos: newPos } : null,
        }));
        return;
      }
    }
  }, []);

  const hardDrop = useCallback(() => {
    const s = stateRef.current;
    if (!s.currentPiece || s.gameOver || s.paused) return;
    const ghostY = getGhostY(s.board, s.currentPiece);
    const dropDistance = ghostY - s.currentPiece.pos.y;
    sounds.drop();
    setState(prev => ({
      ...prev,
      currentPiece: prev.currentPiece ? { ...prev.currentPiece, pos: { x: prev.currentPiece.pos.x, y: ghostY } } : null,
      score: prev.score + dropDistance * 2,
    }));
    setTimeout(() => lockPiece(), 10);
  }, [lockPiece]);

  const softDrop = useCallback(() => {
    const s = stateRef.current;
    if (!s.currentPiece || s.gameOver || s.paused) return;
    const newPos = { x: s.currentPiece.pos.x, y: s.currentPiece.pos.y + 1 };
    if (!collides(s.board, s.currentPiece.shape, newPos)) {
      setState(prev => ({
        ...prev,
        currentPiece: prev.currentPiece ? { ...prev.currentPiece, pos: newPos } : null,
        score: prev.score + 1,
      }));
    }
  }, []);

  const togglePause = useCallback(() => {
    setState(prev => {
      if (prev.gameOver || !prev.started) return prev;
      const newPaused = !prev.paused;
      if (newPaused) {
        if (timerRef.current) clearTimeout(timerRef.current);
      } else {
        const speed = LEVEL_SPEEDS[Math.min(prev.level, LEVEL_SPEEDS.length - 1)];
        timerRef.current = setTimeout(tick, speed);
      }
      return { ...prev, paused: newPaused, message: newPaused ? 'PAUSED' : '' };
    });
  }, [tick]);

  const checkKonami = useCallback((key: string) => {
    konamiRef.current.push(key);
    if (konamiRef.current.length > KONAMI_CODE.length) konamiRef.current.shift();
    if (
      konamiRef.current.length === KONAMI_CODE.length &&
      konamiRef.current.every((k, i) => k === KONAMI_CODE[i])
    ) {
      konamiActiveRef.current = true;
      sounds.konami();
      showMessage("⬆️⬆️⬇️⬇️⬅️➡️⬅️➡️🅱️🅰️ — PARTY MODE! 🎉🎊", 4000);
      konamiRef.current = [];
    }
  }, [showMessage]);

  // Keyboard handler — only active when game panel is open
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        // Only prevent default if game is active to avoid hijacking app shortcuts
        if (stateRef.current.started && !stateRef.current.gameOver) e.preventDefault();
      }
      checkKonami(e.key);
      switch (e.key) {
        case 'ArrowLeft': moveLeft(); break;
        case 'ArrowRight': moveRight(); break;
        case 'ArrowDown': softDrop(); break;
        case 'ArrowUp': rotatePiece(); break;
        case ' ': if (stateRef.current.started) hardDrop(); break;
        case 'p': case 'P': togglePause(); break;
        case 'Enter':
          if (stateRef.current.gameOver || !stateRef.current.started) startGame();
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [moveLeft, moveRight, softDrop, rotatePiece, hardDrop, togglePause, startGame, checkKonami]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, []);

  // Build display board with ghost + current piece
  const displayBoard = state.board.map(row => [...row]);
  if (state.currentPiece && !state.gameOver) {
    const ghostY = getGhostY(state.board, state.currentPiece);
    if (ghostY !== state.currentPiece.pos.y) {
      for (let y = 0; y < state.currentPiece.shape.length; y++) {
        for (let x = 0; x < state.currentPiece.shape[y].length; x++) {
          if (state.currentPiece.shape[y][x]) {
            const by = ghostY + y;
            const bx = state.currentPiece.pos.x + x;
            if (by >= 0 && by < BOARD_HEIGHT && bx >= 0 && bx < BOARD_WIDTH && displayBoard[by][bx] === 0) {
              displayBoard[by][bx] = 8;
            }
          }
        }
      }
    }
    for (let y = 0; y < state.currentPiece.shape.length; y++) {
      for (let x = 0; x < state.currentPiece.shape[y].length; x++) {
        if (state.currentPiece.shape[y][x]) {
          const by = state.currentPiece.pos.y + y;
          const bx = state.currentPiece.pos.x + x;
          if (by >= 0 && by < BOARD_HEIGHT && bx >= 0 && bx < BOARD_WIDTH) {
            displayBoard[by][bx] = state.currentPiece.color;
          }
        }
      }
    }
  }

  return {
    ...state,
    displayBoard,
    startGame,
    moveLeft,
    moveRight,
    rotatePiece,
    softDrop,
    hardDrop,
    togglePause,
    isKonamiActive: konamiActiveRef.current,
  };
}
