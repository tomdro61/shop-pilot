"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EstimateLineItemForm } from "@/components/forms/estimate-line-item-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteEstimateLineItem } from "@/lib/actions/estimates";
import { formatCurrency } from "@/lib/utils/format";
import { calculateTotals } from "@/lib/utils/totals";
import { SECTION_LABEL } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { EstimateLineItem, ShopSettings } from "@/types";

export function EstimateLineItemsAddButton({ estimateId }: { estimateId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add
      </Button>
      <EstimateLineItemForm
        estimateId={estimateId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

interface EstimateLineItemsListProps {
  estimateId: string;
  lineItems: EstimateLineItem[];
  readOnly?: boolean;
  settings?: ShopSettings | null;
}

export function EstimateLineItemsList({
  estimateId,
  lineItems,
  readOnly = false,
  settings,
}: EstimateLineItemsListProps) {
  const [editItem, setEditItem] = useState<EstimateLineItem | null>(null);

  const totals = calculateTotals(lineItems, settings);

  async function handleDelete(id: string) {
    const result = await deleteEstimateLineItem(id, estimateId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Line item deleted");
    }
    return result;
  }

  // Group line items by category
  const categoryGroups: Record<string, EstimateLineItem[]> = {};
  lineItems.forEach((li) => {
    const cat = li.category || "Uncategorized";
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(li);
  });

  const categoryNames = Object.keys(categoryGroups);

  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
      {lineItems.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {readOnly ? "No line items." : "No line items yet. Tap Add to get started."}
          </p>
        </div>
      ) : (
        <>
          {/* Category groups */}
          {categoryNames.map((catName) => {
            const items = categoryGroups[catName];
            const catTotal = items.reduce((sum, li) => sum + (li.total || 0), 0);

            return (
              <div key={catName}>
                {/* Category header */}
                <div className="flex items-center justify-between px-4 py-2 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/40">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                    {catName}
                  </h4>
                  <span className="font-mono tabular-nums text-xs font-medium text-indigo-700 dark:text-indigo-300">
                    {formatCurrency(catTotal)}
                  </span>
                </div>

                {/* Rows */}
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="group relative flex items-start gap-3 px-4 py-2.5 border-b border-stone-100 dark:border-stone-800/60"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r",
                        item.type === "labor" ? "bg-blue-500" : "bg-amber-500"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                          <p className="text-sm text-stone-900 dark:text-stone-50 truncate">
                            {item.description}
                          </p>
                          {item.part_number && (
                            <span className="shrink-0 font-mono text-xs text-stone-400">
                              #{item.part_number}
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 font-mono tabular-nums text-sm font-medium text-stone-900 dark:text-stone-50">
                          {formatCurrency(item.total ?? 0)}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono tabular-nums text-xs text-stone-500 dark:text-stone-400">
                        {item.type === "labor"
                          ? `${item.quantity} hr × ${formatCurrency(item.unit_cost)}/hr`
                          : `${item.quantity} × ${formatCurrency(item.unit_cost)}`}
                      </p>
                    </div>
                    {!readOnly && (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Edit"
                          onClick={() => setEditItem(item)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <DeleteConfirmDialog
                          title="Delete Line Item"
                          description={`Delete "${item.description}"?`}
                          onConfirm={() => handleDelete(item.id)}
                          trigger={
                            <Button variant="ghost" size="icon-xs" title="Delete">
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          }
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Totals */}
          <div className="px-4 py-3 border-t border-stone-200 dark:border-stone-800">
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-xs">
              {totals.laborTotal > 0 && (
                <>
                  <dt className="text-stone-500 dark:text-stone-400 justify-self-end">Labor</dt>
                  <dd className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                    {formatCurrency(totals.laborTotal)}
                  </dd>
                </>
              )}
              {totals.partsTotal > 0 && (
                <>
                  <dt className="text-stone-500 dark:text-stone-400 justify-self-end">Parts</dt>
                  <dd className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                    {formatCurrency(totals.partsTotal)}
                  </dd>
                </>
              )}
              {totals.shopSuppliesEnabled && totals.shopSupplies > 0 && (
                <>
                  <dt className="text-stone-500 dark:text-stone-400 justify-self-end">Shop Supplies</dt>
                  <dd className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                    {formatCurrency(totals.shopSupplies)}
                  </dd>
                </>
              )}
              {totals.hazmatEnabled && totals.hazmat > 0 && (
                <>
                  <dt className="text-stone-500 dark:text-stone-400 justify-self-end">{totals.hazmatLabel}</dt>
                  <dd className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                    {formatCurrency(totals.hazmat)}
                  </dd>
                </>
              )}
              {totals.taxAmount > 0 && (
                <>
                  <dt className="text-stone-500 dark:text-stone-400 justify-self-end">
                    Tax ({(totals.taxRate * 100).toFixed(2)}%)
                  </dt>
                  <dd className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                    {formatCurrency(totals.taxAmount)}
                  </dd>
                </>
              )}
            </dl>
            <div className="mt-2 pt-2 border-t border-stone-200 dark:border-stone-700 flex items-baseline justify-between">
              <span className={SECTION_LABEL}>Total</span>
              <span className="font-mono tabular-nums text-base font-semibold text-stone-900 dark:text-stone-50">
                {formatCurrency(totals.grandTotal)}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Edit form */}
      {editItem && (
        <EstimateLineItemForm
          estimateId={estimateId}
          lineItem={editItem}
          open={!!editItem}
          onOpenChange={(open) => {
            if (!open) setEditItem(null);
          }}
        />
      )}
    </div>
  );
}
