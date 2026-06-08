export function LandingBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="viewport-thermal-edge viewport-thermal-edge--fire opacity-55" />
      <div className="viewport-thermal-edge viewport-thermal-edge--ice opacity-50" />

      <div className="fire-orb -left-32 -top-28 h-96 w-96 opacity-70" />
      <div className="ice-orb -right-40 top-10 h-[26rem] w-[26rem] opacity-60" />
      <div className="fire-orb purple-bridge-orb left-1/3 -bottom-56 h-[28rem] w-[28rem] opacity-20" />

      <div className="hidden md:block">
        <div className="circuit-mesh opacity-35" />
      </div>

      <div className="mesh-overlay opacity-25" />
    </div>
  );
}
