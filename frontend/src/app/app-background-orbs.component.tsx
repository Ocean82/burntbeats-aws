/**
 * Decorative background — dual realm (industrial fire left, tech ice right),
 * ember/ice orbs, circuit mesh, and a dramatic center "collision" where a
 * fiery lightning bolt meets an icy one (subtle yin-yang duality without
 * the literal symbol). Pointer-events disabled.
 */
export function AppBackgroundOrbs() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Viewport rim — extreme hot / cold frame */}
      <div
        className="viewport-thermal-edge viewport-thermal-edge--fire"
        aria-hidden
      />
      <div
        className="viewport-thermal-edge viewport-thermal-edge--ice"
        aria-hidden
      />

      {/* Split atmosphere: forge floor (L) vs cold lattice (R) */}
      <div className="app-dual-field" />
      <div className="app-dual-field__ember" />
      <div className="app-dual-field__frost" />

      {/* Fire side — left (industrial, molten) */}
      <div className="fire-orb left-[-10rem] top-[-8rem] h-96 w-96" />
      <div className="fire-orb left-[-5rem] bottom-[18%] h-[24rem] w-[24rem] opacity-55" />
      <div className="fire-orb left-[10%] top-[40%] h-[16rem] w-[16rem] opacity-30" />

      {/* Ice side — right (tech, crystalline) */}
      <div className="ice-orb right-[-12rem] top-16 h-[28rem] w-[28rem] opacity-70" />
      <div className="ice-orb right-[-7rem] bottom-[-10rem] h-[26rem] w-[26rem] opacity-50" />
      <div className="ice-orb right-[8%] top-[35%] h-[14rem] w-[14rem] opacity-35" />

      {/* Bridge tone — center violet warmth (kept low) */}
      <div className="fire-orb purple-bridge-orb pointer-events-none left-1/3 bottom-[-14rem] h-[30rem] w-[30rem] opacity-25" />

      <div className="circuit-mesh" />
      <div className="circuit-mesh-industrial" />
      <div className="mesh-overlay" />

      {/* Fire bolt vs Ice bolt collision — reads as duality without a yin-yang glyph */}
      <div className="lightning-collision-wrap">
        <svg
          className="lightning-collision-svg"
          viewBox="0 0 960 420"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <defs>
            <filter
              id="fireBoltGlow"
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur stdDeviation="6" result="b" />
              <feColorMatrix
                in="b"
                type="matrix"
                values="1.2 0 0 0 0.1  0 0.4 0 0 0  0 0 0.1 0 0  0 0 0 1 0"
                result="warm"
              />
              <feMerge>
                <feMergeNode in="warm" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter
              id="iceBoltGlow"
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur stdDeviation="5.5" result="b2" />
              <feColorMatrix
                in="b2"
                type="matrix"
                values="0.1 0 0 0 0  0 0.6 0 0 0.1  0 0 1.3 0 0.15  0 0 0 1 0"
                result="cool"
              />
              <feMerge>
                <feMergeNode in="cool" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter
              id="collisionFlash"
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur stdDeviation="12" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="collisionCore" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.98)" />
              <stop offset="20%" stopColor="rgba(255,240,220,0.7)" />
              <stop offset="45%" stopColor="rgba(180,245,255,0.45)" />
              <stop offset="70%" stopColor="rgba(255,120,50,0.25)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            <linearGradient id="fireStrokeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#cc0000" stopOpacity="0.9" />
              <stop offset="30%" stopColor="#ff3300" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#ff8800" stopOpacity="1" />
              <stop offset="100%" stopColor="#ffcc66" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="iceStrokeGrad" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#004488" stopOpacity="0.85" />
              <stop offset="30%" stopColor="#0088cc" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#00ccff" stopOpacity="1" />
              <stop offset="100%" stopColor="#ccffff" stopOpacity="0.75" />
            </linearGradient>
            {/* Secondary bolt gradients — thinner, offset */}
            <linearGradient id="fireStrokeGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ff2200" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ffaa44" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="iceStrokeGrad2" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#0066aa" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#66ddff" stopOpacity="0.4" />
            </linearGradient>
          </defs>

          {/* Secondary fire bolt — background layer */}
          <path
            className="lightning-collision-path lightning-collision-path--fire"
            d="M -30 225 L 60 215 L 95 255 L 150 190 L 210 240 L 275 195 L 340 230 L 400 205 L 450 222 L 490 212"
            stroke="url(#fireStrokeGrad2)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#fireBoltGlow)"
            fill="none"
            opacity="0.6"
          />

          {/* Primary fire bolt — jagged, industrial energy */}
          <path
            className="lightning-collision-path lightning-collision-path--fire"
            d="M -20 210 L 65 195 L 105 248 L 160 172 L 225 232 L 285 180 L 348 222 L 408 192 L 458 216 L 490 208"
            stroke="url(#fireStrokeGrad)"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#fireBoltGlow)"
            fill="none"
          />

          {/* Secondary ice bolt — background layer */}
          <path
            className="lightning-collision-path lightning-collision-path--ice"
            d="M 990 195 L 900 208 L 860 162 L 805 240 L 745 185 L 685 225 L 625 190 L 565 215 L 520 200 L 500 208"
            stroke="url(#iceStrokeGrad2)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="miter"
            filter="url(#iceBoltGlow)"
            fill="none"
            opacity="0.55"
          />

          {/* Primary ice bolt — crisp, precise, tech energy */}
          <path
            className="lightning-collision-path lightning-collision-path--ice"
            d="M 980 210 L 892 226 L 848 165 L 795 238 L 735 185 L 675 224 L 615 190 L 555 220 L 515 200 L 500 208"
            stroke="url(#iceStrokeGrad)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="miter"
            filter="url(#iceBoltGlow)"
            fill="none"
          />

          {/* Collision core — where fire meets ice */}
          <circle
            className="lightning-collision-core"
            cx="495"
            cy="208"
            r="44"
            fill="url(#collisionCore)"
            filter="url(#collisionFlash)"
          />

          {/* Inner white-hot spark at collision point */}
          <circle
            className="lightning-collision-core"
            cx="495"
            cy="208"
            r="12"
            fill="rgba(255,255,255,0.85)"
            style={{ animationDelay: "-1.2s" }}
          />
        </svg>
      </div>
    </div>
  );
}
