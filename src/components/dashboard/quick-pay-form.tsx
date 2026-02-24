"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, Delete } from "lucide-react";
import { createQuickPayJob } from "@/lib/actions/terminal";
import { formatCurrency } from "@/lib/utils/format";

type QuickPayState = "input" | "processing" | "succeeded" | "failed" | "canceled";

interface QuickPayPreset {
  id: string;
  name: string;
  category: string | null;
  total: number;
}

const NUM_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];

export function QuickPayForm({ presets = [] }: { presets?: QuickPayPreset[] }) {
  const [amountStr, setAmountStr] = useState("0");
  const [note, setNote] = useState("");
  const [state, setState] = useState<QuickPayState>("input");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [completedJobId, setCompletedJobId] = useState<string | null>(null);

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
    try {
      const res = await fetch(`/api/terminal/status?pi=${piId}`);
      const data = await res.json();

      if (data.status === "succeeded") {
        setState("succeeded");
        toast.success("Payment collected!");
        return;
      }

      if (data.status === "canceled") {
        setState("canceled");
        return;
      }

      // Still processing — poll again
      setTimeout(() => pollStatus(piId), 2000);
    } catch {
      setTimeout(() => pollStatus(piId), 3000);
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
      // Start polling
      setTimeout(() => pollStatus(data.paymentIntentId), 2000);
    } catch {
      setState("failed");
      toast.error("Failed to connect to terminal");
    }
  }

  async function handleCancel() {
    try {
      await fetch("/api/terminal/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId }),
      });
      setState("canceled");
      toast("Payment canceled");
    } catch {
      toast.error("Failed to cancel");
    }
  }

  function handleReset() {
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
      <Card className="mx-auto max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 p-8">
          <p className="text-3xl font-bold tabular-nums">{displayAmount}</p>

          {state === "processing" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Waiting for customer to present card...
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
              <XCircle className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Payment canceled</p>
              <Button variant="outline" onClick={handleReset}>Start Over</Button>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // Input state — numpad
  return (
    <div className="mx-auto max-w-sm space-y-4">
      {/* Amount display */}
      <div className="rounded-xl border bg-card p-6 text-center">
        <p className="text-4xl font-bold tabular-nums tracking-tight">
          {displayAmount}
        </p>
      </div>

      {/* Service presets */}
      {presets.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">
            Quick Services
          </p>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetSelect(preset)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedPresetId === preset.id
                    ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400"
                    : "border-stone-200 dark:border-stone-700 bg-card text-foreground hover:bg-stone-50 dark:hover:bg-stone-800"
                }`}
              >
                {preset.name} · {formatCurrency(preset.total)}
              </button>
            ))}
          </div>
        </div>
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
        className="w-full text-muted-foreground"
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
