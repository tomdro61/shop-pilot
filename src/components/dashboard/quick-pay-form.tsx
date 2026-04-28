"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, XCircle, Delete, Search, X } from "lucide-react";
import { createQuickPayJob } from "@/lib/actions/terminal";
import { formatCurrency } from "@/lib/utils/format";

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
  selectedPresetId,
  onSelect,
}: {
  presets: QuickPayPreset[];
  selectedPresetId: string | null;
  onSelect: (preset: QuickPayPreset) => void;
}) {
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const filtered = presets.filter(
    (p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const selected = selectedPresetId ? presets.find((p) => p.id === selectedPresetId) : null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
        Quick Services
      </p>

      {selected ? (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-3 py-2">
          <span className="flex-1 text-sm font-bold text-blue-700 dark:text-blue-400">
            {selected.name}
          </span>
          <span className="text-sm font-semibold tabular-nums text-blue-700 dark:text-blue-400">
            {formatCurrency(selected.total)}
          </span>
          <button
            type="button"
            onClick={() => onSelect(selected)}
            className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
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
            <div className="absolute z-50 mt-1 w-full rounded-lg border border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-900 max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="py-3 text-center text-sm text-stone-500 dark:text-stone-400">No presets match</p>
              ) : (
                filtered.map((preset) => (
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
                    <span className="text-xs tabular-nums text-stone-500 shrink-0">
                      {formatCurrency(preset.total)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const NUM_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];

export function QuickPayForm({ presets = [] }: { presets?: QuickPayPreset[] }) {
  const [amountStr, setAmountStr] = useState("0");
  const [note, setNote] = useState("");
  const [state, setState] = useState<QuickPayState>("input");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
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
    setSelectedPresetId(null);
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
    setSelectedPresetId(null);
    setAmountStr((prev) => {
      if (prev.length <= 1) return "0";
      return prev.slice(0, -1);
    });
  }

  function handlePresetSelect(preset: QuickPayPreset) {
    const isDeselect = selectedPresetId === preset.id;
    if (isDeselect) {
      setSelectedPresetId(null);
      setAmountStr("0");
      setNote("");
      return;
    }
    setSelectedPresetId(preset.id);
    // Convert total to string with 2 decimal places, stripping trailing zeros
    const totalStr = preset.total % 1 === 0
      ? String(preset.total)
      : preset.total.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    setAmountStr(totalStr);
    setNote(preset.name);
  }

  function handleClear() {
    setAmountStr("0");
    setSelectedPresetId(null);
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

    setState("processing");

    // Create skeleton job — use preset category if one is selected
    const selectedPreset = presets.find((p) => p.id === selectedPresetId);
    const jobResult = await createQuickPayJob(amountCents, note || undefined, selectedPreset?.category || undefined);
    if (jobResult.error || !jobResult.data) {
      setState("failed");
      toast.error(jobResult.error || "Failed to create job");
      return;
    }

    const jobId = jobResult.data.jobId;
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
    setAmountStr("0");
    setNote("");
    setState("input");
    setSelectedPresetId(null);
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
                {completedJobId && (
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
          selectedPresetId={selectedPresetId}
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
