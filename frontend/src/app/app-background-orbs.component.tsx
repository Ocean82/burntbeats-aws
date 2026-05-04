/**
 * Decorative background — fire orbs + mesh. Pointer-events disabled.
 */
export function AppBackgroundOrbs() {
  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="fire-orb left-[-8rem] top-[-6rem] h-80 w-80" />
      <div className="fire-orb right-[-10rem] top-20 h-[26rem] w-[26rem] opacity-75" />
      <div className="fire-orb bottom-[-12rem] left-1/3 h-[30rem] w-[30rem] opacity-60" />
      <div className="mesh-overlay" />
    </div>
  );
}
