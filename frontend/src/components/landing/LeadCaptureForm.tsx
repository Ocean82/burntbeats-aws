import { useState } from "react";
import { Mail, Check } from "lucide-react";
import { API_BASE } from "../../config";

export function LeadCaptureForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) return;
    setStatus("submitting");
    try {
      const res = await fetch(`${API_BASE}/api/newsletter/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMsg("Could not subscribe. Try again later.");
    }
  };

  if (status === "success") {
    return (
      <div className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl border border-success-400/30 bg-success-500/10 px-lg py-md text-sm text-success-200">
        <Check className="h-4 w-4" aria-hidden />
        You're in. We'll send the first email soon.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md">
      <p className="mb-sm text-center text-sm font-medium text-secondary-foreground">
        Get production tips and feature updates
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            required
            className="w-full rounded-xl border border-border bg-muted py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary-400/50 focus:outline-none focus:ring-1 focus:ring-primary-400/30"
          />
        </div>
        <button type="submit" disabled={status === "submitting"}
          className="fire-button shrink-0 rounded-xl px-md py-2.5 text-sm font-semibold disabled:opacity-60">
          {status === "submitting" ? "Sending..." : "Subscribe"}
        </button>
      </div>
      {status === "error" && (
        <p className="mt-1 text-xs text-error-red">{errorMsg}</p>
      )}
    </form>
  );
}
