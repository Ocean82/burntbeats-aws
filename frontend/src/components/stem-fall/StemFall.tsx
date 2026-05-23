import { useEffect, useState, useRef } from 'react';
import { useStemFall } from './useStemFall';
import { COLORS, BOARD_WIDTH, BOARD_HEIGHT, CELL_SIZE, IDLE_MESSAGES } from './constants';

const SIDE_PANEL_W = 72; // px reserved for score/next panel
const MIN_CELL = 16;
const MAX_CELL = CELL_SIZE; // 26 — desktop default

function getResponsiveCellSize(): number {
  if (typeof window === 'undefined') return MAX_CELL;
  const available = window.innerWidth - SIDE_PANEL_W - 32; // 32px padding
  const fit = Math.floor(available / BOARD_WIDTH);
  return Math.max(MIN_CELL, Math.min(MAX_CELL, fit));
}

function NextPiecePreview({ piece, cellSize }: { piece: { shape: number[][]; color: number } | null; cellSize: number }) {
  if (!piece) return null;
  return (
    <div className="flex flex-col items-center gap-px">
      {piece.shape.map((row, y) => (
        <div key={y} className="flex gap-px">
          {row.map((cell, x) => (
            <div
              key={x}
              style={{
                width: cellSize,
                height: cellSize,
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

export default function WaitingGame() {
  const game = useStemFall();
  const [idleMsg, setIdleMsg] = useState('');
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cellSize, setCellSize] = useState(getResponsiveCellSize);

  // Recalculate on resize
  useEffect(() => {
    const onResize = () => setCellSize(getResponsiveCellSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init + interval setup
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

    const w = BOARD_WIDTH * cellSize;
    const h = BOARD_HEIGHT * cellSize;
    canvas.width = w;
    canvas.height = h;

    // Background
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= BOARD_WIDTH; x++) {
      ctx.beginPath(); ctx.moveTo(x * cellSize, 0); ctx.lineTo(x * cellSize, h); ctx.stroke();
    }
    for (let y = 0; y <= BOARD_HEIGHT; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * cellSize); ctx.lineTo(w, y * cellSize); ctx.stroke();
    }

    // Draw cells
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const cell = game.displayBoard[y][x];
        if (cell === 0) continue;

        const px = x * cellSize;
        const py = y * cellSize;
        const pad = 1;
        const size = cellSize - pad * 2;

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
  }, [game.displayBoard, cellSize]);

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

  const boardW = BOARD_WIDTH * cellSize;
  const boardH = BOARD_HEIGHT * cellSize;
  const previewCellSize = Math.max(12, Math.round(cellSize * 0.7));

  return (
    <div className="flex flex-col items-center gap-sm select-none py-xs" style={{ fontFamily: "'Press Start 2P', 'Courier New', monospace" }}>

      {/* Idle message */}
      <div className="h-4 text-center text-helper text-muted-foreground max-w-xs px-xs">
        {idleMsg}
      </div>

      <div className="flex gap-md items-start">
        {/* Board */}
        <div className="relative" style={{ width: boardW, height: boardH }}>
          <canvas
            ref={canvasRef}
            className="rounded-lg border border-border"
            style={{ width: boardW, height: boardH }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          />

          {/* Start overlay */}
          {!game.started && !game.gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-sm rounded-lg bg-chrome backdrop-blur-sm">
              <div className="text-sm text-primary-400 animate-pulse tracking-widest">THE WAITING GAME</div>
              <div className="text-helper text-muted-foreground">drop blocks while you wait</div>
              <button
                type="button"
                onClick={game.startGame}
                className="tap-feedback mt-1 min-h-[44px] rounded-lg border border-primary-500/40 bg-primary-500/15 px-md py-xs text-xs text-primary-200 transition-[color,background-color,transform] duration-[var(--motion-fast)] hover:bg-primary-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
              >
                START / ENTER
              </button>
              <div className="text-meta text-muted-foreground text-center leading-relaxed mt-xs">
                ← → move &nbsp;·&nbsp; ↑ rotate<br />
                ↓ soft drop &nbsp;·&nbsp; SPACE hard drop<br />
                P pause
              </div>
            </div>
          )}

          {/* Game over overlay */}
          {game.gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-xs rounded-lg bg-chrome backdrop-blur-sm">
              <div className="text-sm text-destructive-400 tracking-widest">GAME OVER</div>
              <div className="text-helper text-muted-foreground text-center px-md">{game.message}</div>
              <div className="text-xs text-foreground mt-1">{game.score.toLocaleString()}</div>
              <div className="text-meta text-muted-foreground">lines {game.lines} · lvl {game.level}</div>
              <button
                type="button"
                onClick={game.startGame}
                className="tap-feedback mt-xs min-h-[44px] rounded-lg border border-primary-500/40 bg-primary-500/15 px-md py-xs text-xs text-primary-200 transition-[color,background-color,transform] duration-[var(--motion-fast)] hover:bg-primary-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
              >
                PLAY AGAIN
              </button>
            </div>
          )}

          {/* Paused overlay */}
          {game.paused && !game.gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-xs rounded-lg bg-chrome backdrop-blur-sm">
              <div className="text-sm text-primary-300 animate-pulse">PAUSED</div>
              <div className="text-meta text-muted-foreground">press P to resume</div>
            </div>
          )}

          {/* Toast message */}
          {game.message && !game.gameOver && !game.paused && game.started && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-primary-500/30 bg-chrome px-sm py-xs text-xs text-primary-200 animate-pulse" role="status" aria-live="polite">
              {game.message}
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-sm" style={{ minWidth: SIDE_PANEL_W }}>
          <div>
            <div className="text-meta text-muted-foreground mb-1 tracking-widest">SCORE</div>
            <div className="text-xs text-foreground tabular-nums">{game.score.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-meta text-muted-foreground mb-1 tracking-widest">LEVEL</div>
            <div className="text-xs text-primary-300">{game.level}</div>
          </div>
          <div>
            <div className="text-meta text-muted-foreground mb-1 tracking-widest">LINES</div>
            <div className="text-xs text-foreground">{game.lines}</div>
          </div>
          <div>
            <div className="text-meta text-muted-foreground mb-xs tracking-widest">NEXT</div>
            <div className="flex items-center justify-center rounded-lg border border-border bg-secondary p-xs" style={{ minHeight: 56 }}>
              <NextPiecePreview piece={game.nextPiece} cellSize={previewCellSize} />
            </div>
          </div>

          {/* Pause button */}
          {game.started && !game.gameOver && (
            <button
              type="button"
              onClick={game.togglePause}
              className="tap-feedback min-h-[44px] w-full rounded-lg border border-border bg-muted px-xs py-xs text-meta text-muted-foreground transition-[color,background-color,transform] duration-[var(--motion-fast)] hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
            >
              {game.paused ? 'RESUME' : 'PAUSE'}
            </button>
          )}

          {/* Mobile d-pad */}
          <div className="flex flex-col gap-2xs mt-1 md:hidden" role="group" aria-label="Touch controls">
            <div className="flex justify-center">
              <button type="button" onPointerDown={game.rotatePiece} aria-label="Rotate" className="tap-feedback flex h-11 w-11 items-center justify-center rounded bg-muted text-sm transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">↑</button>
            </div>
            <div className="flex gap-2xs justify-center">
              <button type="button" onPointerDown={game.moveLeft} aria-label="Move left" className="tap-feedback flex h-11 w-11 items-center justify-center rounded bg-muted text-sm transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">←</button>
              <button type="button" onPointerDown={game.softDrop} aria-label="Soft drop" className="tap-feedback flex h-11 w-11 items-center justify-center rounded bg-muted text-sm transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">↓</button>
              <button type="button" onPointerDown={game.moveRight} aria-label="Move right" className="tap-feedback flex h-11 w-11 items-center justify-center rounded bg-muted text-sm transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">→</button>
            </div>
            <button type="button" onPointerDown={game.hardDrop} aria-label="Hard drop" className="tap-feedback mt-1 flex min-h-[44px] w-full items-center justify-center rounded bg-muted text-meta transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">DROP</button>
          </div>
        </div>
      </div>

      {game.started && (
        <div className="text-meta text-muted-foreground text-center">
          there might be a secret code hidden somewhere
        </div>
      )}
    </div>
  );
}
