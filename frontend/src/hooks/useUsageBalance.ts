import { useAuth } from "@clerk/react";
import { useCallback, useEffect, useState } from "react";
import { API_BASE, isLocalDevFullApp } from "../config";

export interface UsageBalanceState {
  balance: number | null;
  periodEnd: number | null;
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
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!enabled || localDev || !isSignedIn) {
      setBalance(null);
      setPeriodEnd(null);
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        setBalance(null);
        setPeriodEnd(null);
        return;
      }
      const res = await fetch(`${API_BASE}/api/billing/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setBalance(null);
        setPeriodEnd(null);
        return;
      }
      const j = (await res.json()) as { balance?: unknown; periodEnd?: unknown };
      setBalance(typeof j.balance === "number" && Number.isFinite(j.balance) ? j.balance : null);
      setPeriodEnd(typeof j.periodEnd === "number" && Number.isFinite(j.periodEnd) ? j.periodEnd : null);
    } catch {
      setBalance(null);
      setPeriodEnd(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, getToken, isSignedIn, localDev]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { balance, periodEnd, loading, refetch };
}
