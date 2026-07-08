"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, XCircle, Delete, Search, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { isInspectionCategory } from "@/lib/utils/revenue";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 2000;
const ERROR_BACKOFF_MS = 3000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;
const MAX_CONSECUTIVE_ERRORS = 5;

type QuickPayState = "input" | "processing" | "succeeded" | "failed" | "canceled";

interface QuickPayPreset {
  id: string;
  name: string;
  category: string | null;
  total: number;
}

function QuickPayPresetPicker({
  presets,
  selectedPresetIds,
  onSelect,
}: {
  presets: QuickPayPreset[];
  selectedPresetIds: string[];
  onSelect: (preset: QuickPayPreset) => void;
}) {
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const filtered = presets.filter(
    (p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const quickPresets = presets.filter((p) => isInspectionCategory(p.category));
  const quickPresetIds = new Set(quickPresets.map((p) => p.id));

  // Selected presets not shown in the quick-services row — surface them as
  // removable chips so the operator can see what was added via search.
  const selectedExtraPresets = selectedPresetIds
    .map((id) => presets.find((p) => p.id === id))
    .filter((p): p is QuickPayPreset => p !== undefined && !quickPresetIds.has(p.id));

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
        Quick Services
      </p>

      {quickPresets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {quickPresets.map((preset) => {
            const active = selectedPresetIds.includes(preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelect(preset)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-2 h-9 px-3 rounded-md border text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300"
                    : "bg-card border-stone-200 text-stone-700 hover:bg-stone-50 dark:bg-stone-900 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-800/60"
                )}
              >
                <span>{preset.name}</span>
                <span
                  className={cn(
                    "font-mono tabular-nums text-xs",
                    active
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-stone-500 dark:text-stone-400"
                  )}
                >
                  {formatCurrency(preset.total)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selectedExtraPresets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedExtraPresets.map((preset) => (
            <div
              key={preset.id}
              className="inline-flex items-center gap-2 h-9 pl-3 pr-2 rounded-md border border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300"
            >
              <span className="text-sm font-medium">{preset.name}</span>
              <span className="font-mono tabular-nums text-xs text-blue-600 dark:text-blue-400">
                {formatCurrency(preset.total)}
              </span>
              <button
                type="button"
                onClick={() => onSelect(preset)}
                aria-label={`Remove ${preset.name}`}
                className="ml-1 text-blue-400 hover:text-blue-700 dark:hover:text-blue-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <Input
          placeholder="Search presets..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true); }}
          onFocus={() => setDropdownOpen(true)}
          onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
          className="pl-9"
        />
        {dropdownOpen && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-stone-200 bg-card shadow-card dark:border-stone-700 dark:bg-stone-900 max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-3 text-center text-sm text-stone-500 dark:text-stone-400">No presets match</p>
            ) : (
              filtered.map((preset) => {
                const active = selectedPresetIds.includes(preset.id);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                    onClick={() => {
                      onSelect(preset);
                      setSearch("");
                      setDropdownOpen(false);
                    }}
                  >
                    <span className="flex-1 truncate font-medium">{preset.name}</span>
                    {active && (
                      <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 shrink-0">
                        Selected
                      </span>
                    )}
                    <span className="text-xs tabular-nums text-stone-500 shrink-0">
                      {formatCurrency(preset.total)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const NUM_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];

export function QuickPayForm({
  presets = [],
  canViewJob = true,
}: {
  presets?: QuickPayPreset[];
  canViewJob?: boolean;
}) {
  const [amountStr, setAmountStr] = useState("0");
  const [note, setNote] = useState("");
  const [state, setState] = useState<QuickPayState>("input");
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [completedJobId, setCompletedJobId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef<number | null>(null);
  const consecutiveErrorsRef = useRef(0);
  const cancelingRef = useRef(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const amountCents = Math.round(parseFloat(amountStr || "0") * 100);
  const displayAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);

  function handleKey(key: string) {
    setSelectedPresetIds([]);
    setAmountStr((prev) => {
      if (key === "." && prev.includes(".")) return prev;
      // Limit to 2 decimal places
      const parts = prev.split(".");
      if (parts[1] && parts[1].length >= 2) return prev;
      // Remove leading zero unless decimal
      if (prev === "0" && key !== ".") return key;
      return prev + key;
    });
  }

  function handleBackspace() {
    setSelectedPresetIds([]);
    setAmountStr((prev) => {
      if (prev.length <= 1) return "0";
      return prev.slice(0, -1);
    });
  }

  function handlePresetSelect(preset: QuickPayPreset) {
    const isSelected = selectedPresetIds.includes(preset.id);
    const next = isSelected
      ? selectedPresetIds.filter((id) => id !== preset.id)
      : [...selectedPresetIds, preset.id];

    const nextPresets = next
      .map((id) => presets.find((p) => p.id === id))
      .filter((p): p is QuickPayPreset => Boolean(p));

    const total = nextPresets.reduce((sum, p) => sum + p.total, 0);
    const totalStr =
      total === 0
        ? "0"
        : total % 1 === 0
          ? String(total)
          : total.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");

    setSelectedPresetIds(next);
    setAmountStr(totalStr);
    setNote(nextPresets.map((p) => p.name).join(", "));
  }

  function handleClear() {
    setAmountStr("0");
    setNote("");
    setSelectedPresetIds([]);
  }

  const pollStatus = useCallback(async (piId: string) => {
    if (!mountedRef.current) return;

    if (pollStartRef.current === null) pollStartRef.current = Date.now();
    if (Date.now() - pollStartRef.current > MAX_POLL_DURATION_MS) {
      setState("failed");
      toast.error("Payment timed out — verify status on terminal");
      return;
    }

    try {
      const res = await fetch(`/api/terminal/status?pi=${piId}`);
      if (res.status === 401 || res.status === 403) {
        // Session expired mid-poll — stop polling and tell them to re-auth.
        // The Stripe webhook records the payment independently, so a charge
        // that cleared on the reader is not lost.
        setState("failed");
        toast.error("Session expired — sign in again and verify payment on the terminal");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!mountedRef.current) return;
      if (cancelingRef.current) return;
      consecutiveErrorsRef.current = 0;

      if (data.status === "succeeded") {
        setState("succeeded");
        toast.success("Payment collected!");
        return;
      }

      if (data.status === "canceled") {
        setState("canceled");
        return;
      }

      pollTimeoutRef.current = setTimeout(() => pollStatus(piId), POLL_INTERVAL_MS);
    } catch {
      if (!mountedRef.current) return;
      if (cancelingRef.current) return;
      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
        setState("failed");
        toast.error("Lost connection to terminal — verify payment status");
        return;
      }
      pollTimeoutRef.current = setTimeout(() => pollStatus(piId), ERROR_BACKOFF_MS);
    }
  }, []);

  async function handleCharge() {
    if (amountCents <= 0) {
      toast.error("Enter an amount");
      return;
    }
    if (state !== "input") return;

    setState("processing");

    // Category for the job: only use a shared category when EVERY selected
    // preset has it. A mix of categorized + uncategorized presets falls
    // through to the server default ("Quick Pay") so revenue isn't silently
    // misattributed in category-trends.
    const selectedPresets = selectedPresetIds
      .map((id) => presets.find((p) => p.id === id))
      .filter((p): p is QuickPayPreset => Boolean(p));
    const categories = selectedPresets
      .map((p) => p.category)
      .filter((c): c is string => Boolean(c));
    const sharedCategory =
      categories.length > 0 &&
      categories.length === selectedPresets.length &&
      categories.every((c) => c === categories[0])
        ? categories[0]
        : undefined;

    let jobId: string;
    try {
      const res = await fetch("/api/quick-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, note: note || undefined, category: sharedCategory }),
      });
      const data = await res.json();
      if (!res.ok || !data.jobId) {
        setState("failed");
        toast.error(data.error || "Failed to create job");
        return;
      }
      jobId = data.jobId;
    } catch {
      setState("failed");
      toast.error("Failed to create job");
      return;
    }

    setCompletedJobId(jobId);

    // Send to terminal
    try {
      const res = await fetch("/api/terminal/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, amountCents }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState("failed");
        toast.error(data.error || "Failed to start terminal payment");
        return;
      }

      setPaymentIntentId(data.paymentIntentId);
      pollStartRef.current = null;
      consecutiveErrorsRef.current = 0;
      pollTimeoutRef.current = setTimeout(() => pollStatus(data.paymentIntentId), POLL_INTERVAL_MS);
    } catch {
      setState("failed");
      toast.error("Failed to connect to terminal");
    }
  }

  async function handleCancel() {
    if (cancelingRef.current) return;
    cancelingRef.current = true;
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    try {
      const res = await fetch("/api/terminal/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Cancel may have failed — verify on terminal");
        cancelingRef.current = false;
        return;
      }
      setState("canceled");
      toast("Payment canceled");
    } catch {
      toast.error("Cancel may have failed — verify on terminal");
      cancelingRef.current = false;
    }
  }

  function handleReset() {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    pollStartRef.current = null;
    consecutiveErrorsRef.current = 0;
    cancelingRef.current = false;
    setAmountStr("0");
    setNote("");
    setState("input");
    setSelectedPresetIds([]);
    setPaymentIntentId(null);
    setCompletedJobId(null);
  }

  // Processing / Success / Failed / Canceled states
  if (state !== "input") {
    return (
      <div className="mx-auto max-w-sm bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
        <div className="flex flex-col items-center gap-4 p-8">
          <p className="font-mono tabular-nums text-3xl font-bold text-stone-900 dark:text-stone-50">{displayAmount}</p>

          {state === "processing" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 dark:text-blue-500" />
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Waiting for customer to present card…
              </p>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </>
          )}

          {state === "succeeded" && (
            <>
              <CheckCircle2 className="h-12 w-12 text-emerald-500 dark:text-emerald-400" />
              <p className="text-lg font-medium text-emerald-600 dark:text-emerald-400">Payment Complete</p>
              <div className="flex gap-2">
                {canViewJob && completedJobId && (
                  <Link href={`/jobs/${completedJobId}`}>
                    <Button variant="outline" size="sm">View Job</Button>
                  </Link>
                )}
                <Button size="sm" onClick={handleReset}>New Payment</Button>
              </div>
            </>
          )}

          {state === "failed" && (
            <>
              <XCircle className="h-12 w-12 text-red-500 dark:text-red-400" />
              <p className="text-sm text-red-600 dark:text-red-400">Payment failed</p>
              <Button variant="outline" onClick={handleReset}>Try Again</Button>
            </>
          )}

          {state === "canceled" && (
            <>
              <XCircle className="h-12 w-12 text-stone-400 dark:text-stone-500" />
              <p className="text-sm text-stone-500 dark:text-stone-400">Payment canceled</p>
              <Button variant="outline" onClick={handleReset}>Start Over</Button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Input state — numpad
  return (
    <div className="mx-auto max-w-sm space-y-4">
      {/* Amount display */}
      <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-card shadow-sm p-6 text-center">
        <p className="font-mono tabular-nums text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
          {displayAmount}
        </p>
      </div>

      {/* Service presets */}
      {presets.length > 0 && (
        <QuickPayPresetPicker
          presets={presets}
          selectedPresetIds={selectedPresetIds}
          onSelect={handlePresetSelect}
        />
      )}

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-2">
        {NUM_KEYS.map((key) => (
          <Button
            key={key}
            variant="outline"
            className="h-14 text-xl font-medium"
            onClick={() => handleKey(key)}
          >
            {key}
          </Button>
        ))}
        <Button
          variant="outline"
          className="h-14"
          onClick={handleBackspace}
        >
          <Delete className="h-5 w-5" />
        </Button>
      </div>

      {/* Clear */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-stone-500 dark:text-stone-400"
        onClick={handleClear}
      >
        Clear
      </Button>

      {/* Note field */}
      <Input
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {/* Charge button */}
      <Button
        className="h-14 w-full text-lg font-semibold"
        onClick={handleCharge}
        disabled={amountCents <= 0}
      >
        Charge {displayAmount}
      </Button>
    </div>
  );
}
