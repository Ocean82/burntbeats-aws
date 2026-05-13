/**
 * Decorative background — fire orbs (left/warm) + ice orbs (right/cool) + meshes.
 * Yin-yang duality: music/fire on the left, circuit/ice on the right.
 * Pointer-events disabled.
 */
export function AppBackgroundOrbs() {
  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Fire side — left/top */}
      <div className="fire-orb left-[-8rem] top-[-6rem] h-80 w-80" />
      <div className="fire-orb left-[-4rem] bottom-[20%] h-[22rem] w-[22rem] opacity-50" />

      {/* Ice side — right/bottom */}
      <div className="ice-orb right-[-10rem] top-20 h-[26rem] w-[26rem] opacity-65" />
      <div className="ice-orb right-[-6rem] bottom-[-8rem] h-[24rem] w-[24rem] opacity-45" />

      {/* Purple bridge — center, connecting fire and ice */}
      <div className="fire-orb left-1/3 bottom-[-12rem] h-[28rem] w-[28rem] opacity-30" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(168, 85, 247, 0.3), rgba(120, 60, 200, 0.15) 30%, transparent 65%)' }} />

      {/* Overlays */}
      <div className="circuit-mesh" />
      <div className="mesh-overlay" />
    </div>
  );
}
