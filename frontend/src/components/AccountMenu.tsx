import { useEffect, useRef, useState, type ReactNode } from "react";
import { useClerk, useUser } from "@clerk/react";
import {
  ChevronDown,
  Coins,
  Loader2,
  LogOut,
  User,
  X,
} from "lucide-react";
import { cn } from "../utils/cn";

export interface AccountMenuProps {
  localDevFullApp: boolean;
  subscriptionPlan: string | null;
  subscriptionActive: boolean;
  usageBalance: number | null | undefined;
  usageLoading: boolean;
}

/**
 * Avatar account popout: profile summary, Clerk account management, sign out.
 * Plans, billing, and app utilities live in SettingsMenu (three dots).
 */
export function AccountMenu({
  localDevFullApp,
  subscriptionPlan,
  subscriptionActive,
  usageBalance,
  usageLoading,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = "account-menu-panel";

  const { isLoaded: userLoaded, isSignedIn, user } = useUser();
  const { openUserProfile, signOut } = useClerk();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  const displayName =
    user?.fullName?.trim() ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "Account";

  const email = user?.primaryEmailAddress?.emailAddress;

  const tokenLabel = usageLoading
    ? "…"
    : usageBalance != null
      ? `${Math.floor(usageBalance)} tokens`
      : "—";

  if (localDevFullApp) {
    return (
      <span className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
        Local dev
      </span>
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-[44px] max-w-[min(100%,12rem)] items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 pl-1 pr-2 text-left transition tap-feedback sm:max-w-none sm:pr-2.5",
          open && "border-amber-400/45 bg-amber-500/12",
        )}
        aria-haspopup="true"
        aria-controls={menuId}
        aria-expanded={open ? "true" : "false"}
        aria-label={open ? "Close account menu" : "Open account menu"}
      >
        {userLoaded && isSignedIn && user?.imageUrl ? (
          <img
            src={user.imageUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-lg border border-white/15 object-cover"
          />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/50">
            {userLoaded ? (
              <User className="h-4 w-4" aria-hidden />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
          </span>
        )}
        <span className="hidden min-w-0 flex-1 flex-col sm:flex">
          <span className="truncate text-xs font-semibold text-white/90">
            {userLoaded ? displayName : "Loading…"}
          </span>
          <span className="truncate text-[10px] text-white/45">
            {subscriptionActive && subscriptionPlan
              ? `${subscriptionPlan} · ${tokenLabel}`
              : tokenLabel}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "hidden h-4 w-4 shrink-0 text-white/45 transition sm:block",
            open && "rotate-180 text-amber-200/80",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-full z-dropdown mt-2 w-[min(calc(100vw-2rem),16rem)] overflow-hidden rounded-2xl border border-white/15 bg-[#14100e]/98 shadow-2xl backdrop-blur-md"
        >
          <div className="border-b border-white/10 px-4 py-4">
            <div className="flex items-start gap-3">
              {user?.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-xl border border-white/15 object-cover"
                />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5">
                  <User className="h-5 w-5 text-white/50" aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white/95">
                  {displayName}
                </p>
                {email && (
                  <p className="truncate text-xs text-white/50">{email}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {subscriptionActive && subscriptionPlan && (
                    <span className="inline-flex items-center rounded-full border border-emerald-400/35 bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-200/90">
                      {subscriptionPlan}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-100/95">
                    {usageLoading ? (
                      <Loader2
                        className="h-3 w-3 animate-spin text-amber-300/80"
                        aria-hidden
                      />
                    ) : (
                      <Coins className="h-3 w-3 text-amber-300/90" aria-hidden />
                    )}
                    {tokenLabel}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white/80"
                aria-label="Close account menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="py-1">
            <AccountMenuItem
              icon={<User className="h-4 w-4" />}
              label="Manage account"
              onClick={() => {
                openUserProfile();
                close();
              }}
            />
            <AccountMenuItem
              icon={<LogOut className="h-4 w-4" />}
              label="Sign out"
              variant="danger"
              onClick={() => {
                void signOut();
                close();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMenuItem({
  icon,
  label,
  variant = "default",
  onClick,
}: {
  icon: ReactNode;
  label: string;
  variant?: "default" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-white/8",
        variant === "danger" ? "text-red-300/90" : "text-white/85",
      )}
    >
      <span
        className={cn(
          "opacity-70",
          variant === "danger" && "text-red-400/80",
        )}
      >
        {icon}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  );
}
