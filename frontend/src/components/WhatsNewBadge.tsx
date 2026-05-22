/**
 * WhatsNewBadge — pulsing dot indicator shown on nav tabs with new features.
 */

interface WhatsNewBadgeProps {
  /** Whether this tab has unseen changelog entries */
  visible: boolean;
}

export function WhatsNewBadge({ visible }: WhatsNewBadgeProps) {
  if (!visible) return null;

  return (
    <span
      className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5"
      aria-label="New feature available"
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-400" />
    </span>
  );
}
