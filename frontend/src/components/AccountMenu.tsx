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
      <span className="rounded-xl border border-success-500/40 bg-success-500/10 px-sm py-1.5 text-[10px] font-semibold uppercase tracking-wide text-success-200/90">
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
          "flex min-h-[44px] max-w-[min(100%,12rem)] items-center gap-xs rounded-xl border border-border bg-muted pl-1 pr-2 text-left transition tap-feedback sm:max-w-none sm:pr-2.5",
          open && "border-primary-400/45 bg-primary-500/12",
        )}
        aria-haspopup="true"
        aria-controls={menuId}
        aria-expanded={open ? "true" : "false"}
        aria-label={open ? "Close account menu" : "Open account menu"}
        data-testid="account-menu"
      >
        {userLoaded && isSignedIn && user?.imageUrl ? (
          <img
            src={user.imageUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-lg border border-border object-cover"
          />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
            {userLoaded ? (
              <User className="h-4 w-4" aria-hidden />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
          </span>
        )}
        <span className="hidden min-w-0 flex-1 flex-col sm:flex">
          <span className="truncate text-xs font-semibold text-secondary-foreground">
            {userLoaded ? displayName : "Loading…"}
          </span>
          <span className="truncate text-[10px] text-muted-foreground">
            {subscriptionActive && subscriptionPlan
              ? `${subscriptionPlan} · ${tokenLabel}`
              : tokenLabel}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "hidden h-4 w-4 shrink-0 text-muted-foreground transition sm:block",
            open && "rotate-180 text-primary-200/80",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-full z-dropdown mt-xs w-[min(calc(100vw-2rem),16rem)] overflow-hidden rounded-2xl border border-border bg-popover/98 shadow-elevation-xl backdrop-blur-md"
        >
          <div className="border-b border-border px-md py-md">
            <div className="flex items-start gap-sm">
              {user?.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-xl border border-border object-cover"
                />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted">
                  <User className="h-5 w-5 text-muted-foreground" aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-secondary-foreground">
                  {displayName}
                </p>
                {email && (
                  <p className="truncate text-xs text-muted-foreground">{email}</p>
                )}
                <div className="mt-xs flex flex-wrap items-center gap-xs">
                  {subscriptionActive && subscriptionPlan && (
                    <span className="inline-flex items-center rounded-full border border-success-400/35 bg-success-500/12 px-xs py-0.5 text-[10px] font-medium uppercase tracking-wide text-success-200/90">
                      {subscriptionPlan}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-2xs rounded-full border border-primary-400/25 bg-primary-500/10 px-xs py-0.5 text-[10px] font-semibold tabular-nums text-primary-100/95">
                    {usageLoading ? (
                      <Loader2
                        className="h-3 w-3 animate-spin text-primary-300/80"
                        aria-hidden
                      />
                    ) : (
                      <Coins className="h-3 w-3 text-primary-300/90" aria-hidden />
                    )}
                    {tokenLabel}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-secondary-foreground"
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
        "flex w-full items-center gap-sm px-md py-sm text-left text-sm transition hover:bg-muted",
        variant === "danger" ? "text-destructive-300/90" : "text-secondary-foreground",
      )}
    >
      <span
        className={cn(
          "opacity-70",
          variant === "danger" && "text-destructive-400/80",
        )}
      >
        {icon}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  );
}
