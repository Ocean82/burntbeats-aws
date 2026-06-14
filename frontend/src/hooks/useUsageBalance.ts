import { useAuth } from "@clerk/react";
import { useCallback, useEffect, useState } from "react";
import { API_BASE, isLocalDevFullApp } from "../config";

export interface UsageBalanceState {
  balance: number | null;
  periodEnd: number | null;
  paidBalance: number | null;
  freeMonthlyRemaining: number | null;
  welcomeGranted: boolean;
  loading: boolean;
  refetch: () => void;
}

/**
 * Fetches remaining usage tokens from GET /api/billing/usage (when signed in, non–local-dev).
 */
export function useUsageBalance(enabled: boolean): UsageBalanceState {
  const localDev = isLocalDevFullApp();
  const { getToken, isSignedIn } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [periodEnd, setPeriodEnd] = useState<number | null>(null);
  const [paidBalance, setPaidBalance] = useState<number | null>(null);
  const [freeMonthlyRemaining, setFreeMonthlyRemaining] = useState<number | null>(null);
  const [welcomeGranted, setWelcomeGranted] = useState(false);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!enabled || localDev || !isSignedIn) {
      setBalance(null);
      setPeriodEnd(null);
      setPaidBalance(null);
      setFreeMonthlyRemaining(null);
      setWelcomeGranted(false);
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        setBalance(null);
        setPeriodEnd(null);
        setPaidBalance(null);
        setFreeMonthlyRemaining(null);
        setWelcomeGranted(false);
        return;
      }
      const res = await fetch(`${API_BASE}/api/billing/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setBalance(null);
        setPeriodEnd(null);
        setPaidBalance(null);
        setFreeMonthlyRemaining(null);
        setWelcomeGranted(false);
        return;
      }
      const j = (await res.json()) as {
        balance?: unknown;
        periodEnd?: unknown;
        paidBalance?: unknown;
        freeMonthlyRemaining?: unknown;
        welcomeGranted?: unknown;
      };
      setBalance(typeof j.balance === "number" && Number.isFinite(j.balance) ? j.balance : null);
      setPeriodEnd(typeof j.periodEnd === "number" && Number.isFinite(j.periodEnd) ? j.periodEnd : null);
      setPaidBalance(
        typeof j.paidBalance === "number" && Number.isFinite(j.paidBalance)
          ? j.paidBalance
          : null,
      );
      setFreeMonthlyRemaining(
        typeof j.freeMonthlyRemaining === "number" &&
          Number.isFinite(j.freeMonthlyRemaining)
          ? j.freeMonthlyRemaining
          : null,
      );
      setWelcomeGranted(j.welcomeGranted === true);
    } catch {
      setBalance(null);
      setPeriodEnd(null);
      setPaidBalance(null);
      setFreeMonthlyRemaining(null);
      setWelcomeGranted(false);
    } finally {
      setLoading(false);
    }
  }, [enabled, getToken, isSignedIn, localDev]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- trigger async fetch on mount/auth change
    void refetch();
  }, [refetch]);

  return {
    balance,
    periodEnd,
    paidBalance,
    freeMonthlyRemaining,
    welcomeGranted,
    loading,
    refetch,
  };
}
