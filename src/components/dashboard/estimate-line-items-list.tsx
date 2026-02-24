"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EstimateLineItemForm } from "@/components/forms/estimate-line-item-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteEstimateLineItem } from "@/lib/actions/estimates";
import { formatCurrency } from "@/lib/utils/format";
import { MA_SALES_TAX_RATE } from "@/lib/constants";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { EstimateLineItem } from "@/types";

interface EstimateLineItemsListProps {
  estimateId: string;
  lineItems: EstimateLineItem[];
  readOnly?: boolean;
}

export function EstimateLineItemsList({
  estimateId,
  lineItems,
  readOnly = false,
}: EstimateLineItemsListProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<EstimateLineItem | null>(null);

  const laborItems = lineItems.filter((li) => li.type === "labor");
  const partItems = lineItems.filter((li) => li.type === "part");
  const laborTotal = laborItems.reduce((sum, li) => sum + (li.total || 0), 0);
  const partsTotal = partItems.reduce((sum, li) => sum + (li.total || 0), 0);
  const taxAmount = partsTotal * MA_SALES_TAX_RATE;
  const grandTotal = laborTotal + partsTotal + taxAmount;

  async function handleDelete(id: string) {
    const result = await deleteEstimateLineItem(id, estimateId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Line item deleted");
    }
    return result;
  }

  function formatDetail(item: EstimateLineItem) {
    if (item.type === "labor") {
      return `${item.quantity} hrs × ${formatCurrency(item.unit_cost)}/hr`;
    }
    return `${item.quantity} × ${formatCurrency(item.unit_cost)}`;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">Line Items</CardTitle>
        {!readOnly && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {lineItems.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">
            No line items yet. Add labor or parts.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              {lineItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg bg-stone-50 dark:bg-stone-950 px-4 py-3"
                >
                  <div className={`w-1 h-8 shrink-0 rounded-full ${item.type === "labor" ? "bg-blue-400" : "bg-amber-400"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-stone-800 dark:text-stone-200">
                        {item.description}
                        {item.part_number && (
                          <span className="ml-2 text-xs text-stone-400 dark:text-stone-500">#{item.part_number}</span>
                        )}
                      </p>
                      <span className="ml-3 shrink-0 text-sm font-semibold text-stone-900 dark:text-stone-50">{formatCurrency(item.total)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">{formatDetail(item)}</p>
                  </div>
                  {!readOnly && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditItem(item)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <DeleteConfirmDialog
                        title="Delete Line Item"
                        description={`Delete "${item.description}"?`}
                        onConfirm={() => handleDelete(item.id)}
                        trigger={
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        }
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-stone-200 dark:border-stone-800 pt-3 space-y-1">
              <div className="flex justify-end gap-6 text-sm text-stone-500 dark:text-stone-400">
                {laborItems.length > 0 && <span>Labor: {formatCurrency(laborTotal)}</span>}
                {partItems.length > 0 && <span>Parts: {formatCurrency(partsTotal)}</span>}
              </div>
              {partItems.length > 0 && (
                <div className="flex justify-end text-sm text-stone-500 dark:text-stone-400">
                  Tax ({(MA_SALES_TAX_RATE * 100).toFixed(2)}% on parts): {formatCurrency(taxAmount)}
                </div>
              )}
              <div className="flex justify-end">
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-[0.06em]">Total</p>
                  <p className="text-2xl font-bold text-stone-900 dark:text-stone-50 tracking-tight">{formatCurrency(grandTotal)}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>

      {!readOnly && (
        <>
          <EstimateLineItemForm
            estimateId={estimateId}
            open={addOpen}
            onOpenChange={setAddOpen}
          />

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
        </>
      )}
    </Card>
  );
}
