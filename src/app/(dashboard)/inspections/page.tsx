"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";
import { Plus, Minus, Check } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

const INSPECTION_ROWS = [
  { key: "retail_state", label: "Retail State", rate: 35, lineDescription: "Retail State Inspections" },
  { key: "retail_tnc", label: "Retail TNC", rate: 35, lineDescription: "Retail TNC Inspections" },
  { key: "hertz_state", label: "Hertz State", rate: 35, lineDescription: "Hertz State Inspections" },
  { key: "hertz_tnc", label: "Hertz TNC", rate: 35, lineDescription: "Hertz TNC Inspections" },
  { key: "sixt_state", label: "Sixt State", rate: 35, lineDescription: "Sixt State Inspections" },
  { key: "sixt_tnc", label: "Sixt TNC", rate: 35, lineDescription: "Sixt TNC Inspections" },
  { key: "drivewhip_state", label: "DriveWhip State", rate: 35, lineDescription: "DriveWhip State Inspections" },
  { key: "drivewhip_tnc", label: "DriveWhip TNC", rate: 35, lineDescription: "DriveWhip TNC Inspections" },
];

export default function InspectionsPage() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [counts, setCounts] = useState<Record<string, number>>(
    Object.fromEntries(INSPECTION_ROWS.map((r) => [r.key, 0]))
  );
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);
  const [closedSummary, setClosedSummary] = useState<{ label: string; count: number; total: number }[]>([]);

  function increment(key: string) {
    setCounts((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
  }

  function decrement(key: string) {
    setCounts((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) - 1) }));
  }

  const grandTotal = INSPECTION_ROWS.reduce(
    (sum, row) => sum + (counts[row.key] || 0) * row.rate,
    0
  );

  const totalCount = INSPECTION_ROWS.reduce(
    (sum, row) => sum + (counts[row.key] || 0),
    0
  );

  async function handleCloseDay() {
    setClosing(true);
    try {
      const supabase = createClient();

      // Find or create "Broadway Motors" customer for inspection jobs
      let { data: bwCustomer } = await supabase
        .from("customers")
        .select("id")
        .eq("first_name", "Broadway")
        .eq("last_name", "Motors")
        .maybeSingle();

      if (!bwCustomer) {
        const { data: newCustomer } = await supabase
          .from("customers")
          .insert({
            first_name: "Broadway",
            last_name: "Motors",
            notes: "Internal account for daily inspection tallies",
          })
          .select("id")
          .single();
        bwCustomer = newCustomer;
      }

      if (!bwCustomer) {
        toast.error("Could not find or create Broadway Motors customer");
        setClosing(false);
        return;
      }

      // Create job
      const { data: job, error: jobError } = await supabase
        .from("jobs")
        .insert({
          customer_id: bwCustomer.id,
          status: "complete",
          category: "Inspection",
          date_received: date,
          date_finished: date,
          payment_status: "unpaid",
          notes: `Daily inspection tally for ${date}`,
        })
        .select("id")
        .single();

      if (jobError || !job) {
        toast.error(jobError?.message || "Failed to create job");
        setClosing(false);
        return;
      }

      // Create line items for each row with count > 0
      const lineItems = INSPECTION_ROWS.filter((row) => (counts[row.key] || 0) > 0).map((row) => ({
        job_id: job.id,
        type: "labor" as const,
        description: row.lineDescription,
        quantity: counts[row.key] || 0,
        unit_cost: row.rate,
      }));

      if (lineItems.length > 0) {
        const { error: liError } = await supabase
          .from("job_line_items")
          .insert(lineItems);

        if (liError) {
          toast.error(liError.message);
          setClosing(false);
          return;
        }
      }

      const summary = INSPECTION_ROWS.filter((row) => (counts[row.key] || 0) > 0).map((row) => ({
        label: row.label,
        count: counts[row.key] || 0,
        total: (counts[row.key] || 0) * row.rate,
      }));

      setClosedSummary(summary);
      setClosed(true);
      toast.success("Day closed successfully");
    } catch {
      toast.error("An error occurred");
    } finally {
      setClosing(false);
    }
  }

  function handleReset() {
    setCounts(Object.fromEntries(INSPECTION_ROWS.map((r) => [r.key, 0])));
    setClosed(false);
    setClosedSummary([]);
    setDate(new Date().toISOString().split("T")[0]);
  }

  if (closed) {
    const closedTotal = closedSummary.reduce((s, r) => s + r.total, 0);
    const closedCount = closedSummary.reduce((s, r) => s + r.count, 0);

    return (
      <div className="mx-auto max-w-lg p-4 lg:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Check className="h-5 w-5 text-green-600" />
              Day Closed — {date}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {closedSummary.map((row) => (
              <div key={row.label} className="flex justify-between text-sm">
                <span>
                  {row.label} x {row.count}
                </span>
                <span className="font-medium">{formatCurrency(row.total)}</span>
              </div>
            ))}
            <div className="border-t pt-2">
              <div className="flex justify-between font-semibold">
                <span>{closedCount} inspections</span>
                <span>{formatCurrency(closedTotal)}</span>
              </div>
            </div>
            <Button onClick={handleReset} variant="outline" className="mt-4 w-full">
              Start New Day
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <CardTitle className="text-base font-semibold">Inspection Counter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {INSPECTION_ROWS.map((row) => {
            const count = counts[row.key] || 0;
            const rowTotal = count * row.rate;
            return (
              <div key={row.key} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-xs text-muted-foreground">
                    @ {formatCurrency(row.rate)} each
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-16 text-right text-sm text-muted-foreground">
                    {formatCurrency(rowTotal)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => decrement(row.key)}
                      disabled={count === 0}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-semibold">
                      {count}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => increment(row.key)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="border-t pt-3">
            <div className="flex justify-between text-base font-semibold">
              <span>{totalCount} inspections</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="w-full" disabled={totalCount === 0 || closing}>
                {closing ? "Closing..." : "Close Day"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Close Day — {date}</AlertDialogTitle>
                <AlertDialogDescription>
                  This will create a job record with {totalCount} inspections
                  totaling {formatCurrency(grandTotal)}. Continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleCloseDay} disabled={closing}>
                  {closing ? "Closing..." : "Close Day"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
