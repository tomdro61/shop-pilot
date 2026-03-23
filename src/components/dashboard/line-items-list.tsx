"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LineItemForm } from "@/components/forms/line-item-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteLineItem } from "@/lib/actions/job-line-items";
import { saveToCatalog } from "@/lib/actions/catalog";
import { formatCurrency } from "@/lib/utils/format";
import { calculateTotals, DEFAULT_SETTINGS } from "@/lib/utils/totals";
import { Plus, Pencil, Trash2, Wrench, BookmarkPlus } from "lucide-react";
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

  async function handleSaveToCatalog(item: JobLineItem) {
    const result = await saveToCatalog({
      type: item.type as "labor" | "part",
      description: item.description,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      cost: item.cost,
      part_number: item.part_number,
      category: item.category,
    });
    if ("duplicate" in result && result.duplicate) {
      toast.info("Already in catalog");
    } else if ("error" in result && result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Failed to save");
    } else {
      toast.success("Saved to catalog");
    }
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

  // Group line items by category
  const categoryGroups: Record<string, JobLineItem[]> = {};
  lineItems.forEach((li) => {
    const cat = li.category || "Uncategorized";
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(li);
  });

  const categoryNames = Object.keys(categoryGroups);

  return (
    <div className="bg-card rounded-xl shadow-card ring-1 ring-stone-200/10 dark:ring-stone-700/20 overflow-hidden">
      {/* ── Header with Add buttons ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 dark:border-stone-800">
        <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">Line Items</h3>
        <div className="flex gap-2">
          <Popover open={servicePickerOpen} onOpenChange={setServicePickerOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" className="rounded-full">
                <Wrench className="mr-2 h-3.5 w-3.5" />
                Add Service
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 max-h-72 overflow-y-auto p-2" align="end">
              <div className="space-y-1">
                {(settings?.job_categories ?? DEFAULT_SETTINGS.job_categories).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                    onClick={() => handleAddService(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => handleAddItem()}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add Item
          </Button>
        </div>
      </div>

      {/* ── Category Tables ── */}
      {lineItems.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No line items yet. Add a service or individual item.
          </p>
        </div>
      ) : (
        <div>
          {categoryNames.map((catName, idx) => {
            const items = categoryGroups[catName];
            const catTotal = items.reduce((sum, li) => sum + (li.total || 0), 0);

            return (
              <div key={catName}>
                {/* Category header */}
                <div className="px-6 py-3 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      {catName}
                    </h4>
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
                  <span className="text-xs font-semibold text-stone-400 dark:text-stone-500">
                    {formatCurrency(catTotal)}
                  </span>
                </div>

                {/* Rows */}
                <div className="py-1.5">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={`group flex items-center gap-3 rounded-lg mx-4 my-1.5 bg-stone-50 dark:bg-stone-950 px-4 py-3 border-l-3 ${item.type === "labor" ? "border-l-blue-400" : "border-l-amber-400"}`}
                    >
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
                        <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">
                          {item.type === "labor"
                            ? `${item.quantity} hrs × ${formatCurrency(item.unit_cost)}/hr`
                            : `${item.quantity} × ${formatCurrency(item.unit_cost)}`}
                          {item.type === "part" && item.cost != null && (
                            <span className="ml-2">
                              (cost: {formatCurrency(item.cost)}, {item.unit_cost > 0 ? ((item.unit_cost - item.cost) / item.unit_cost * 100).toFixed(0) : 0}% margin)
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Save to catalog"
                          onClick={() => handleSaveToCatalog(item)}
                        >
                          <BookmarkPlus className="h-3 w-3" />
                        </Button>
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
              </div>
            );
          })}

          {/* ── Totals ── */}
          <div className="border-t border-stone-200 dark:border-stone-800 px-6 pt-3 pb-5 space-y-1">
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
            <div className="flex justify-end pt-2">
              <div className="text-right">
                <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-widest">Total</p>
                <p className="text-2xl font-black text-stone-900 dark:text-stone-50 tracking-tight">{formatCurrency(totals.grandTotal)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
