"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SECTION_LABEL } from "@/components/ui/section-card";
import { Save } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { INSPECTION_RATE_STATE, INSPECTION_RATE_TNC } from "@/lib/constants";
import {
  getInspectionCounts,
  upsertInspectionCounts,
} from "@/lib/actions/inspections";

function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export default function InspectionsPage() {
  const [date, setDate] = useState(todayLocal);
  const [stateCount, setStateCount] = useState(0);
  const [tncCount, setTncCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadCounts = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const data = await getInspectionCounts(d);
      setStateCount(data?.state_count ?? 0);
      setTncCount(data?.tnc_count ?? 0);
    } catch {
      toast.error("Failed to load counts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCounts(date);
  }, [date, loadCounts]);

  async function handleSave() {
    setSaving(true);
    try {
      await upsertInspectionCounts(date, stateCount, tncCount);
      toast.success("Inspection counts saved");
    } catch {
      toast.error("Failed to save counts");
    } finally {
      setSaving(false);
    }
  }

  const stateTotal = stateCount * INSPECTION_RATE_STATE;
  const tncTotal = tncCount * INSPECTION_RATE_TNC;
  const grandTotal = stateTotal + tncTotal;
  const totalCount = stateCount + tncCount;

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-6 pb-12 space-y-5 lg:space-y-6">
      <div className="py-2">
        <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
          Inspections
        </h1>
        <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
          Daily counts of state and TNC inspections
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor="inspection-date" className={SECTION_LABEL}>
          Date
        </label>
        <Input
          id="inspection-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-[180px] h-9"
        />
      </div>

      <section className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
            Loading…
          </div>
        ) : (
          <>
            <CounterRow
              accent="bg-blue-500"
              label="State Inspection"
              rate={INSPECTION_RATE_STATE}
              total={stateTotal}
              count={stateCount}
              onChange={setStateCount}
              inputId="state-count"
            />
            <CounterRow
              accent="bg-amber-500"
              label="TNC Inspection"
              rate={INSPECTION_RATE_TNC}
              total={tncTotal}
              count={tncCount}
              onChange={setTncCount}
              inputId="tnc-count"
            />

            <div className="px-4 py-3 border-t border-stone-200 dark:border-stone-800 flex items-baseline justify-between">
              <span className={SECTION_LABEL}>
                Total ({totalCount} {totalCount === 1 ? "inspection" : "inspections"})
              </span>
              <span className="font-mono tabular-nums text-base font-semibold text-stone-900 dark:text-stone-50">
                {formatCurrency(grandTotal)}
              </span>
            </div>
          </>
        )}
      </section>

      <Button
        onClick={handleSave}
        disabled={saving || loading}
        className="w-full sm:w-auto"
      >
        <Save className="mr-1.5 h-3.5 w-3.5" />
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function CounterRow({
  accent,
  label,
  rate,
  total,
  count,
  onChange,
  inputId,
}: {
  accent: string;
  label: string;
  rate: number;
  total: number;
  count: number;
  onChange: (n: number) => void;
  inputId: string;
}) {
  return (
    <div className="group relative flex items-center gap-3 px-4 py-3 border-b border-stone-100 dark:border-stone-800/60 last:border-b-0">
      <span aria-hidden className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r ${accent}`} />
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="block text-sm font-semibold text-stone-900 dark:text-stone-50">
          {label}
        </label>
        <div className="mt-0.5 font-mono tabular-nums text-xs text-stone-500 dark:text-stone-400">
          {formatCurrency(rate)} each
        </div>
      </div>
      <span className="font-mono tabular-nums text-sm font-medium text-stone-900 dark:text-stone-50 w-20 text-right">
        {formatCurrency(total)}
      </span>
      <Input
        id={inputId}
        type="number"
        min={0}
        value={count}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        className="w-20 h-9 text-center font-mono tabular-nums"
      />
    </div>
  );
}
