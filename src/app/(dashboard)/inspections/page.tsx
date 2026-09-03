"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SECTION_LABEL } from "@/components/ui/section-card";
import { ACCENT_ICON_TINT } from "@/components/ui/mini-status-card";
import { Save, AlertCircle } from "lucide-react";
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
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);

  // Which load is current. Switching dates fast can land an older response
  // after a newer one; without this the counters would show one date's numbers
  // while `date` names another, and Save would write them to the wrong day.
  const requestRef = useRef(0);

  const loadCounts = useCallback(async (d: string) => {
    const token = ++requestRef.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      const data = await getInspectionCounts(d);
      if (token !== requestRef.current) return;
      setStateCount(data?.state_count ?? 0);
      setTncCount(data?.tnc_count ?? 0);
      setLoadedDate(d);
    } catch (err) {
      if (token !== requestRef.current) {
        Sentry.captureException(err, { tags: { source: "inspections", path: "stale-load" } });
        return;
      }
      Sentry.captureException(err, { tags: { source: "inspections", path: "load" }, extra: { date: d } });
      setLoadFailed(true);
      toast.error("Couldn't load counts for this date");
    } finally {
      if (token === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCounts(date);
  }, [date, loadCounts]);

  async function handleSave() {
    // Pin the date for the whole save: the toast has to name the day the user
    // was on, not whatever the picker shows by the time the write settles.
    const d = date;
    setSaving(true);
    try {
      await upsertInspectionCounts(d, stateCount, tncCount);
      toast.success(`Inspection counts saved for ${d}`);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { source: "inspections", path: "save" },
        extra: { date: d, stateCount, tncCount },
      });
      toast.error(`Couldn't save counts for ${d} — your entries are still on screen`);
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
          disabled={saving}
          className="w-[180px] h-9"
        />
      </div>

      <section className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
        {loading || (loadedDate !== date && !loadFailed) ? (
          <div className="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
            Loading…
          </div>
        ) : loadFailed ? (
          // Editing stays closed here: Save would upsert zeros over this
          // date's real counts.
          <div className="px-4 py-8 flex flex-col items-center text-center gap-3">
            <span className={`w-10 h-10 rounded-md grid place-items-center border ${ACCENT_ICON_TINT.red}`}>
              <AlertCircle aria-hidden className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                Couldn&rsquo;t load counts for this date
              </p>
              <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
                Editing is disabled so saving can&rsquo;t overwrite the real counts.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => loadCounts(date)}>
              Try again
            </Button>
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
        disabled={saving || loading || loadFailed || loadedDate !== date}
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
