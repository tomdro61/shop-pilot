"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LineItemForm } from "@/components/forms/line-item-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteLineItem } from "@/lib/actions/job-line-items";
import { formatCurrency } from "@/lib/utils/format";
import { calculateTotals, DEFAULT_SETTINGS } from "@/lib/utils/totals";
import { Plus, Pencil, Trash2, Wrench } from "lucide-react";
import type { JobLineItem, ShopSettings } from "@/types";

interface LineItemsListProps {
  jobId: string;
  lineItems: JobLineItem[];
  settings?: ShopSettings | null;
}

export function LineItemsList({ jobId, lineItems, settings }: LineItemsListProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<JobLineItem | null>(null);
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [defaultCategory, setDefaultCategory] = useState<string | undefined>(undefined);

  const totals = calculateTotals(lineItems, settings);

  async function handleDelete(id: string) {
    const result = await deleteLineItem(id, jobId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Line item deleted");
    }
    return result;
  }

  function handleAddService(category: string) {
    setServicePickerOpen(false);
    setDefaultCategory(category);
    setAddOpen(true);
  }

  function handleAddItem(category?: string) {
    setDefaultCategory(category);
    setAddOpen(true);
  }

  function formatDetail(item: JobLineItem) {
    if (item.type === "labor") {
      return `${item.quantity} hrs × ${formatCurrency(item.unit_cost)}/hr`;
    }
    return `${item.quantity} × ${formatCurrency(item.unit_cost)}`;
  }

  // Group line items by category
  const categoryGroups: Record<string, JobLineItem[]> = {};
  lineItems.forEach((li) => {
    const cat = li.category || "Uncategorized";
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(li);
  });

  const categoryNames = Object.keys(categoryGroups);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">Line Items</CardTitle>
        <div className="flex gap-2">
          <Popover open={servicePickerOpen} onOpenChange={setServicePickerOpen}>
            <PopoverTrigger asChild>
              <Button size="sm">
                <Wrench className="mr-2 h-4 w-4" />
                Add Service
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="end">
              <div className="space-y-1">
                {(settings?.job_categories ?? DEFAULT_SETTINGS.job_categories).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                    onClick={() => handleAddService(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="outline" onClick={() => handleAddItem()}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {lineItems.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">
            No line items yet. Add a service or individual item.
          </p>
        ) : (
          <>
            {categoryNames.map((catName) => {
              const items = categoryGroups[catName];
              const catTotal = items.reduce((sum, li) => sum + (li.total || 0), 0);

              return (
                <div key={catName} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{catName}</h3>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => handleAddItem(catName)}
                        title={`Add item to ${catName}`}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">{formatCurrency(catTotal)}</span>
                  </div>
                  {items.map((item) => (
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
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="border-t border-stone-200 dark:border-stone-800 pt-3 space-y-1">
              <div className="flex justify-end gap-6 text-sm text-stone-500 dark:text-stone-400">
                {totals.laborTotal > 0 && <span>Labor: {formatCurrency(totals.laborTotal)}</span>}
                {totals.partsTotal > 0 && <span>Parts: {formatCurrency(totals.partsTotal)}</span>}
              </div>
              {totals.shopSuppliesEnabled && totals.shopSupplies > 0 && (
                <div className="flex justify-end text-sm text-stone-500 dark:text-stone-400">
                  Shop Supplies: {formatCurrency(totals.shopSupplies)}
                </div>
              )}
              {totals.hazmatEnabled && totals.hazmat > 0 && (
                <div className="flex justify-end text-sm text-stone-500 dark:text-stone-400">
                  {totals.hazmatLabel}: {formatCurrency(totals.hazmat)}
                </div>
              )}
              {totals.taxAmount > 0 && (
                <div className="flex justify-end text-sm text-stone-500 dark:text-stone-400">
                  Tax ({(totals.taxRate * 100).toFixed(2)}%): {formatCurrency(totals.taxAmount)}
                </div>
              )}
              <div className="flex justify-end">
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-[0.06em]">Total</p>
                  <p className="text-2xl font-bold text-stone-900 dark:text-stone-50 tracking-tight">{formatCurrency(totals.grandTotal)}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <LineItemForm
        jobId={jobId}
        defaultCategory={defaultCategory}
        categories={settings?.job_categories ?? DEFAULT_SETTINGS.job_categories}
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setDefaultCategory(undefined);
        }}
      />

      {editItem && (
        <LineItemForm
          jobId={jobId}
          lineItem={editItem}
          categories={settings?.job_categories ?? DEFAULT_SETTINGS.job_categories}
          open={!!editItem}
          onOpenChange={(open) => {
            if (!open) setEditItem(null);
          }}
        />
      )}
    </Card>
  );
}
