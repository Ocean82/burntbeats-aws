import { useEffect, useState, useRef } from 'react';
import { useTetris } from './useTetris';
import { COLORS, BOARD_WIDTH, BOARD_HEIGHT, CELL_SIZE, IDLE_MESSAGES } from './constants';

function NextPiecePreview({ piece }: { piece: { shape: number[][]; color: number } | null }) {
  if (!piece) return null;
  return (
    <div className="flex flex-col items-center">
      {piece.shape.map((row, y) => (
        <div key={y} className="flex">
          {row.map((cell, x) => (
            <div
              key={x}
              style={{
                width: 16,
                height: 16,
                backgroundColor: cell ? COLORS[piece.color] : 'transparent',
                border: cell ? '1px solid rgba(0,0,0,0.3)' : 'none',
                boxShadow: cell ? `inset 1px 1px 0 rgba(255,255,255,0.3), inset -1px -1px 0 rgba(0,0,0,0.3)` : 'none',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function TetrisGame() {
  const game = useTetris();
  const [idleMsg, setIdleMsg] = useState('');
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Rotating idle messages
  useEffect(() => {
    setIdleMsg(IDLE_MESSAGES[Math.floor(Math.random() * IDLE_MESSAGES.length)]);
    idleTimerRef.current = setInterval(() => {
      setIdleMsg(IDLE_MESSAGES[Math.floor(Math.random() * IDLE_MESSAGES.length)]);
    }, 5000);
    return () => { if (idleTimerRef.current) clearInterval(idleTimerRef.current); };
  }, []);

  // Canvas rendering for the game board
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = BOARD_WIDTH * CELL_SIZE;
    const h = BOARD_HEIGHT * CELL_SIZE;
    canvas.width = w;
    canvas.height = h;

    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= BOARD_WIDTH; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL_SIZE, 0);
      ctx.lineTo(x * CELL_SIZE, h);
      ctx.stroke();
    }
    for (let y = 0; y <= BOARD_HEIGHT; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL_SIZE);
      ctx.lineTo(w, y * CELL_SIZE);
      ctx.stroke();
    }

    // Draw cells
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const cell = game.displayBoard[y][x];
        if (cell === 0) continue;

        const px = x * CELL_SIZE;
        const py = y * CELL_SIZE;

        if (cell === 8) {
          // Ghost piece
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        } else {
          const color = COLORS[cell] || COLORS[1];
          ctx.fillStyle = color;
          ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);

          // 3D bevel effect (classic tetris style)
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, 2);
          ctx.fillRect(px + 1, py + 1, 2, CELL_SIZE - 2);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(px + 1, py + CELL_SIZE - 3, CELL_SIZE - 2, 2);
          ctx.fillRect(px + CELL_SIZE - 3, py + 1, 2, CELL_SIZE - 2);
        }
      }
    }
  }, [game.displayBoard]);

  // Mobile touch controls
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < 10 && absDy < 10 && dt < 200) {
      // Tap = rotate
      game.rotatePiece();
    } else if (absDy > absDx && dy > 30) {
      // Swipe down = hard drop
      game.hardDrop();
    } else if (absDx > absDy) {
      if (dx > 20) game.moveRight();
      else if (dx < -20) game.moveLeft();
    }
    touchStartRef.current = null;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#111] text-white select-none"
      style={{ fontFamily: "'Press Start 2P', monospace" }}>

      {/* Idle loading message */}
      <div className="text-[10px] text-gray-500 mb-3 h-4 text-center max-w-xs">
        {idleMsg}
      </div>

      <div className="flex gap-4 items-start">
        {/* Game board */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="border border-gray-700 rounded"
            style={{ width: BOARD_WIDTH * CELL_SIZE, height: BOARD_HEIGHT * CELL_SIZE }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          />

          {/* Overlay messages */}
          {!game.started && !game.gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded">
              <div className="text-lg mb-2 animate-pulse">TETRIS</div>
              <div className="text-[8px] text-gray-400 mb-4">while you wait...</div>
              <button
                onClick={game.startGame}
                className="text-[10px] bg-white/10 hover:bg-white/20 px-4 py-2 rounded border border-white/20 transition-colors"
              >
                PRESS ENTER / TAP
              </button>
              <div className="text-[7px] text-gray-600 mt-6 text-center leading-relaxed max-w-[200px]">
                ← → move &nbsp; ↑ rotate<br/>
                ↓ soft drop &nbsp; SPACE hard drop<br/>
                P / ESC pause
              </div>
            </div>
          )}

          {game.gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 rounded">
              <div className="text-sm mb-1 text-red-400">GAME OVER</div>
              <div className="text-[8px] text-gray-400 mb-3">{game.message}</div>
              <div className="text-[9px] mb-1">SCORE: {game.score.toLocaleString()}</div>
              <div className="text-[8px] text-gray-500 mb-4">LINES: {game.lines} &nbsp; LVL: {game.level}</div>
              <button
                onClick={game.startGame}
                className="text-[9px] bg-white/10 hover:bg-white/20 px-4 py-2 rounded border border-white/20 transition-colors"
              >
                PLAY AGAIN
              </button>
            </div>
          )}

          {game.paused && !game.gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded">
              <div className="text-sm animate-pulse">PAUSED</div>
              <div className="text-[8px] text-gray-500 mt-2">press P to resume</div>
            </div>
          )}

          {/* In-game message toast */}
          {game.message && !game.gameOver && !game.paused && game.started && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/70 border border-white/10 rounded px-3 py-1.5 text-[8px] text-center whitespace-nowrap animate-bounce">
              {game.message}
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-4 min-w-[90px]">
          {/* Score */}
          <div>
            <div className="text-[7px] text-gray-500 mb-1">SCORE</div>
            <div className="text-[11px] tabular-nums">{game.score.toLocaleString()}</div>
          </div>

          {/* Level */}
          <div>
            <div className="text-[7px] text-gray-500 mb-1">LEVEL</div>
            <div className="text-[11px]">{game.level}</div>
          </div>

          {/* Lines */}
          <div>
            <div className="text-[7px] text-gray-500 mb-1">LINES</div>
            <div className="text-[11px]">{game.lines}</div>
          </div>

          {/* Next piece */}
          <div>
            <div className="text-[7px] text-gray-500 mb-2">NEXT</div>
            <div className="bg-black/40 p-2 rounded border border-gray-800 flex items-center justify-center min-h-[60px]">
              <NextPiecePreview piece={game.nextPiece} />
            </div>
          </div>

          {/* Mobile controls */}
          <div className="flex flex-col gap-1 mt-2 md:hidden">
            <div className="flex justify-center">
              <button onPointerDown={game.rotatePiece} className="w-10 h-10 bg-white/10 rounded text-sm active:bg-white/20">↑</button>
            </div>
            <div className="flex gap-1 justify-center">
              <button onPointerDown={game.moveLeft} className="w-10 h-10 bg-white/10 rounded text-sm active:bg-white/20">←</button>
              <button onPointerDown={game.softDrop} className="w-10 h-10 bg-white/10 rounded text-sm active:bg-white/20">↓</button>
              <button onPointerDown={game.moveRight} className="w-10 h-10 bg-white/10 rounded text-sm active:bg-white/20">→</button>
            </div>
            <button onPointerDown={game.hardDrop} className="w-full h-8 bg-white/10 rounded text-[8px] active:bg-white/20 mt-1">DROP</button>
          </div>
        </div>
      </div>

      {/* Footer hint */}
      <div className="text-[7px] text-gray-700 mt-4 text-center">
        {game.started ? "pro tip: there might be a secret code hidden somewhere 👀" : ""}
      </div>
    </div>
  );
}
