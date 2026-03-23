import { useEffect, useState, useRef } from 'react';
import { useStemFall } from './useStemFall';
import { COLORS, BOARD_WIDTH, BOARD_HEIGHT, CELL_SIZE, IDLE_MESSAGES } from './constants';

function NextPiecePreview({ piece }: { piece: { shape: number[][]; color: number } | null }) {
  if (!piece) return null;
  return (
    <div className="flex flex-col items-center gap-px">
      {piece.shape.map((row, y) => (
        <div key={y} className="flex gap-px">
          {row.map((cell, x) => (
            <div
              key={x}
              style={{
                width: 14,
                height: 14,
                backgroundColor: cell ? COLORS[piece.color] : 'transparent',
                borderRadius: cell ? 2 : 0,
                boxShadow: cell ? `0 0 6px ${COLORS[piece.color]}60` : 'none',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function StemFall() {
  const game = useStemFall();
  const [idleMsg, setIdleMsg] = useState('');
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setIdleMsg(IDLE_MESSAGES[Math.floor(Math.random() * IDLE_MESSAGES.length)]);
    idleTimerRef.current = setInterval(() => {
      setIdleMsg(IDLE_MESSAGES[Math.floor(Math.random() * IDLE_MESSAGES.length)]);
    }, 5000);
    return () => { if (idleTimerRef.current) clearInterval(idleTimerRef.current); };
  }, []);

  // Canvas rendering
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
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= BOARD_WIDTH; x++) {
      ctx.beginPath(); ctx.moveTo(x * CELL_SIZE, 0); ctx.lineTo(x * CELL_SIZE, h); ctx.stroke();
    }
    for (let y = 0; y <= BOARD_HEIGHT; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * CELL_SIZE); ctx.lineTo(w, y * CELL_SIZE); ctx.stroke();
    }

    // Draw cells
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const cell = game.displayBoard[y][x];
        if (cell === 0) continue;

        const px = x * CELL_SIZE;
        const py = y * CELL_SIZE;
        const pad = 1;
        const size = CELL_SIZE - pad * 2;

        if (cell === 8) {
          // Ghost
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.beginPath();
          ctx.roundRect(px + pad, py + pad, size, size, 3);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.1)';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          const color = COLORS[cell] ?? COLORS[1];
          // Glow
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(px + pad, py + pad, size, size, 3);
          ctx.fill();
          ctx.shadowBlur = 0;

          // Highlight
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.beginPath();
          ctx.roundRect(px + pad, py + pad, size, 3, [3, 3, 0, 0]);
          ctx.fill();
        }
      }
    }
  }, [game.displayBoard]);

  // Touch controls
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);

    if (absDx < 10 && absDy < 10 && dt < 200) game.rotatePiece();
    else if (absDy > absDx && dy > 30) game.hardDrop();
    else if (absDx > absDy) {
      if (dx > 20) game.moveRight();
      else if (dx < -20) game.moveLeft();
    }
    touchStartRef.current = null;
  };

  const boardW = BOARD_WIDTH * CELL_SIZE;
  const boardH = BOARD_HEIGHT * CELL_SIZE;

  return (
    <div className="flex flex-col items-center gap-3 select-none py-2" style={{ fontFamily: "'Press Start 2P', 'Courier New', monospace" }}>

      {/* Idle message */}
      <div className="h-4 text-center text-[9px] text-white/35 max-w-xs px-2">
        {idleMsg}
      </div>

      <div className="flex gap-4 items-start">
        {/* Board */}
        <div className="relative" style={{ width: boardW, height: boardH }}>
          <canvas
            ref={canvasRef}
            className="rounded-lg border border-white/10"
            style={{ width: boardW, height: boardH }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          />

          {/* Start overlay */}
          {!game.started && !game.gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/85 backdrop-blur-sm">
              <div className="text-[11px] text-amber-400 animate-pulse tracking-widest">STEM FALL</div>
              <div className="text-[8px] text-white/40">drop blocks while you wait</div>
              <button
                onClick={game.startGame}
                className="mt-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-[9px] text-amber-200 transition hover:bg-amber-500/25"
              >
                START / ENTER
              </button>
              <div className="text-[7px] text-white/25 text-center leading-relaxed mt-2">
                ← → move &nbsp;·&nbsp; ↑ rotate<br />
                ↓ soft drop &nbsp;·&nbsp; SPACE hard drop<br />
                P pause
              </div>
            </div>
          )}

          {/* Game over overlay */}
          {game.gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/90 backdrop-blur-sm">
              <div className="text-[13px] text-red-400 tracking-widest">GAME OVER</div>
              <div className="text-[8px] text-white/50 text-center px-4">{game.message}</div>
              <div className="text-[9px] text-white mt-1">{game.score.toLocaleString()}</div>
              <div className="text-[7px] text-white/40">lines {game.lines} · lvl {game.level}</div>
              <button
                onClick={game.startGame}
                className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-[9px] text-amber-200 transition hover:bg-amber-500/25"
              >
                PLAY AGAIN
              </button>
            </div>
          )}

          {/* Paused overlay */}
          {game.paused && !game.gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/80 backdrop-blur-sm">
              <div className="text-[12px] text-amber-300 animate-pulse">PAUSED</div>
              <div className="text-[7px] text-white/40">press P to resume</div>
            </div>
          )}

          {/* Toast message */}
          {game.message && !game.gameOver && !game.paused && game.started && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-amber-500/30 bg-black/80 px-3 py-1.5 text-[8px] text-amber-200 animate-bounce">
              {game.message}
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-4" style={{ minWidth: 80 }}>
          <div>
            <div className="text-[7px] text-white/40 mb-1 tracking-widest">SCORE</div>
            <div className="text-[10px] text-white tabular-nums">{game.score.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[7px] text-white/40 mb-1 tracking-widest">LEVEL</div>
            <div className="text-[10px] text-amber-300">{game.level}</div>
          </div>
          <div>
            <div className="text-[7px] text-white/40 mb-1 tracking-widest">LINES</div>
            <div className="text-[10px] text-white">{game.lines}</div>
          </div>
          <div>
            <div className="text-[7px] text-white/40 mb-2 tracking-widest">NEXT</div>
            <div className="flex items-center justify-center rounded-lg border border-white/10 bg-black/40 p-2" style={{ minHeight: 56 }}>
              <NextPiecePreview piece={game.nextPiece} />
            </div>
          </div>

          {/* Pause button */}
          {game.started && !game.gameOver && (
            <button
              onClick={game.togglePause}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[7px] text-white/60 transition hover:text-white"
            >
              {game.paused ? 'RESUME' : 'PAUSE'}
            </button>
          )}

          {/* Mobile d-pad */}
          <div className="flex flex-col gap-1 mt-1 md:hidden">
            <div className="flex justify-center">
              <button onPointerDown={game.rotatePiece} className="h-9 w-9 rounded bg-white/10 text-sm active:bg-white/20">↑</button>
            </div>
            <div className="flex gap-1 justify-center">
              <button onPointerDown={game.moveLeft} className="h-9 w-9 rounded bg-white/10 text-sm active:bg-white/20">←</button>
              <button onPointerDown={game.softDrop} className="h-9 w-9 rounded bg-white/10 text-sm active:bg-white/20">↓</button>
              <button onPointerDown={game.moveRight} className="h-9 w-9 rounded bg-white/10 text-sm active:bg-white/20">→</button>
            </div>
            <button onPointerDown={game.hardDrop} className="mt-1 h-8 w-full rounded bg-white/10 text-[8px] active:bg-white/20">DROP</button>
          </div>
        </div>
      </div>

      {game.started && (
        <div className="text-[7px] text-white/20 text-center">
          👀 there might be a secret code hidden somewhere
        </div>
      )}
    </div>
  );
}
