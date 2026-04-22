"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendInspection } from "@/lib/actions/dvi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DVI_CONDITION_COLORS } from "@/lib/constants";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { DviCondition } from "@/types";

interface DviResult {
  id: string;
  condition: DviCondition | null;
  item_name: string;
  category_name: string;
  note: string | null;
}

interface SendDviDialogProps {
  inspectionId: string;
  results: DviResult[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendDviDialog({
  inspectionId,
  results,
  open,
  onOpenChange,
}: SendDviDialogProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"informational" | "recommendations">("informational");
  const [customerNote, setCustomerNote] = useState("");
  const [isPending, startTransition] = useTransition();

  // Items eligible for recommendations (monitor + attention only)
  const eligibleItems = results.filter(
    (r) => r.condition === "monitor" || r.condition === "attention"
  );

  // Track which items are selected + their description/price
  const [selectedItems, setSelectedItems] = useState<
    Map<string, { description: string; price: string }>
  >(new Map());

  function toggleItem(id: string, itemName: string) {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.set(id, { description: itemName, price: "" });
      }
      return next;
    });
  }

  function updateItem(id: string, field: "description" | "price", value: string) {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const item = next.get(id);
      if (item) {
        next.set(id, { ...item, [field]: value });
      }
      return next;
    });
  }

  function handleSend() {
    startTransition(async () => {
      const recommendedItems =
        mode === "recommendations"
          ? Array.from(selectedItems.entries()).map(([resultId, item]) => ({
              resultId,
              description: item.description,
              price: parseFloat(item.price) || 0,
            }))
          : undefined;

      const result = await sendInspection(inspectionId, {
        mode,
        recommendedItems,
        customerNote: customerNote.trim() || undefined,
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Inspection sent to customer");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Inspection to Customer</DialogTitle>
          <DialogDescription>
            Choose how to share the inspection report.
          </DialogDescription>
        </DialogHeader>

        {/* Note to customer */}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-stone-400">
            Note to Customer <span className="font-normal normal-case text-muted-foreground">(optional)</span>
          </label>
          <textarea
            value={customerNote}
            onChange={(e) => setCustomerNote(e.target.value)}
            placeholder="e.g. Everything looks great, just keep an eye on those front brakes over the next few months."
            rows={3}
            className="mt-1.5 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:border-stone-700 dark:bg-stone-900"
          />
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("informational")}
            className={`flex-1 rounded-lg border-2 p-3 text-left transition-colors ${
              mode === "informational"
                ? "border-blue-600 bg-blue-50 dark:bg-blue-950"
                : "border-stone-200 dark:border-stone-700"
            }`}
          >
            <p className="text-sm font-bold text-stone-900 dark:text-stone-50">Informational</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Report only — no approval needed
            </p>
          </button>
          <button
            type="button"
            onClick={() => setMode("recommendations")}
            className={`flex-1 rounded-lg border-2 p-3 text-left transition-colors ${
              mode === "recommendations"
                ? "border-blue-600 bg-blue-50 dark:bg-blue-950"
                : "border-stone-200 dark:border-stone-700"
            }`}
          >
            <p className="text-sm font-bold text-stone-900 dark:text-stone-50">Recommendations</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Customer can approve services
            </p>
          </button>
        </div>

        {/* Recommendations item picker */}
        {mode === "recommendations" && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400">
              Select items to recommend ({eligibleItems.length} items need attention)
            </p>
            {eligibleItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No monitor or attention items to recommend.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {eligibleItems.map((item) => {
                  const isSelected = selectedItems.has(item.id);
                  const condColor = item.condition
                    ? DVI_CONDITION_COLORS[item.condition]
                    : null;

                  return (
                    <div key={item.id} className="rounded-lg border border-stone-200 dark:border-stone-700 p-3">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItem(item.id, item.item_name)}
                          className="mt-0.5 h-4 w-4 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{item.item_name}</span>
                            {condColor && (
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase ${condColor.bg} ${condColor.text}`}>
                                {item.condition}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{item.category_name}</span>
                        </div>
                      </label>

                      {isSelected && (
                        <div className="mt-2 ml-7 flex gap-2">
                          <Input
                            placeholder="Description"
                            value={selectedItems.get(item.id)?.description ?? ""}
                            onChange={(e) => updateItem(item.id, "description", e.target.value)}
                            className="text-sm h-8"
                          />
                          <Input
                            placeholder="Price"
                            type="number"
                            step="0.01"
                            value={selectedItems.get(item.id)?.price ?? ""}
                            onChange={(e) => updateItem(item.id, "price", e.target.value)}
                            className="text-sm h-8 w-24"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isPending || (mode === "recommendations" && selectedItems.size === 0)}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send to Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
