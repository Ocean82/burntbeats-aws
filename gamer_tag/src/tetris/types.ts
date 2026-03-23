export type Cell = number; // 0 = empty, 1-7 = piece colors, 8 = ghost, 9+ = easter egg
export type Board = Cell[][];
export type Position = { x: number; y: number };

export interface Piece {
  shape: number[][];
  color: number;
  pos: Position;
}

export interface GameState {
  board: Board;
  currentPiece: Piece | null;
  nextPiece: Piece | null;
  score: number;
  lines: number;
  level: number;
  gameOver: boolean;
  paused: boolean;
  started: boolean;
  message: string;
  comboCount: number;
}
