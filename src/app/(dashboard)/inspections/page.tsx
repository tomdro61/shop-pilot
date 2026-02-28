"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="mx-auto max-w-lg p-4 lg:p-6">
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium">Date</label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-[180px]"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Inspection Counter
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : (
            <>
              {/* State Inspections */}
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">State Inspections</p>
                  <p className="text-xs text-muted-foreground">
                    @ {formatCurrency(INSPECTION_RATE_STATE)} each
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-16 text-right text-sm text-muted-foreground">
                    {formatCurrency(stateTotal)}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={stateCount}
                    onChange={(e) => setStateCount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-20 text-center tabular-nums"
                  />
                </div>
              </div>

              {/* TNC Inspections */}
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">TNC Inspections</p>
                  <p className="text-xs text-muted-foreground">
                    @ {formatCurrency(INSPECTION_RATE_TNC)} each
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-16 text-right text-sm text-muted-foreground">
                    {formatCurrency(tncTotal)}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={tncCount}
                    onChange={(e) => setTncCount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-20 text-center tabular-nums"
                  />
                </div>
              </div>

              {/* Totals */}
              <div className="border-t pt-3">
                <div className="flex justify-between text-base font-semibold">
                  <span>{totalCount} inspections</span>
                  <span>{formatCurrency(grandTotal)}</span>
                </div>
              </div>

              {/* Save */}
              <Button
                className="w-full gap-2"
                onClick={handleSave}
                disabled={saving}
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
