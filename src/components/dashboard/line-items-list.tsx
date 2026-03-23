"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LineItemForm } from "@/components/forms/line-item-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteLineItem, createLineItem } from "@/lib/actions/job-line-items";
import { saveToCatalog, incrementUsageCount } from "@/lib/actions/catalog";
import { applyPresetToJob } from "@/lib/actions/presets";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/format";
import { calculateTotals, DEFAULT_SETTINGS } from "@/lib/utils/totals";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, BookmarkPlus, Search } from "lucide-react";
import type { JobLineItem, JobPreset, PresetLineItem, ShopSettings, CatalogItem } from "@/types";

interface LineItemsListProps {
  jobId: string;
  lineItems: JobLineItem[];
  settings?: ShopSettings | null;
  presets?: JobPreset[];
}

export function LineItemsList({ jobId, lineItems, settings, presets = [] }: LineItemsListProps) {
  const [editItem, setEditItem] = useState<JobLineItem | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);

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
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 dark:border-stone-800">
        <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">Line Items</h3>
        <Button size="sm" className="rounded-full" onClick={() => setAddSheetOpen(true)}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {/* ── Category Tables ── */}
      {lineItems.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No line items yet. Tap Add to get started.
          </p>
        </div>
      ) : (
        <div>
          {categoryNames.map((catName) => {
            const items = categoryGroups[catName];
            const catTotal = items.reduce((sum, li) => sum + (li.total || 0), 0);

            return (
              <div key={catName}>
                {/* Category header */}
                <div className="px-6 py-3 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    {catName}
                  </h4>
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

      {/* Edit form */}
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

      {/* Add sheet with tabs */}
      <AddItemSheet
        jobId={jobId}
        presets={presets}
        categories={settings?.job_categories ?? DEFAULT_SETTINGS.job_categories}
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
      />
    </div>
  );
}

// ─── Tabbed Add Sheet ──────────────────────────────────────────

type AddTab = "presets" | "catalog" | "custom";

function AddItemSheet({
  jobId,
  presets,
  categories,
  open,
  onOpenChange,
}: {
  jobId: string;
  presets: JobPreset[];
  categories: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<AddTab>(presets.length > 0 ? "presets" : "catalog");

  // Reset tab when sheet opens
  useEffect(() => {
    if (open) {
      setTab(presets.length > 0 ? "presets" : "catalog");
    }
  }, [open, presets.length]);

  const tabs: { key: AddTab; label: string }[] = [
    ...(presets.length > 0 ? [{ key: "presets" as AddTab, label: "Presets" }] : []),
    { key: "catalog", label: "Catalog" },
    { key: "custom", label: "Custom" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add to Job</SheetTitle>
        </SheetHeader>

        {/* Tabs */}
        <div className="mt-3 flex gap-1 mb-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "text-[11px] font-black px-4 py-1.5 rounded-full uppercase transition-colors",
                tab === t.key
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                  : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "presets" && (
          <PresetsTab presets={presets} jobId={jobId} onDone={() => onOpenChange(false)} />
        )}
        {tab === "catalog" && (
          <CatalogTab jobId={jobId} onDone={() => onOpenChange(false)} />
        )}
        {tab === "custom" && (
          <CustomTab jobId={jobId} categories={categories} onDone={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Presets Tab ───────────────────────────────────────────────

function PresetsTab({
  presets,
  jobId,
  onDone,
}: {
  presets: JobPreset[];
  jobId: string;
  onDone: () => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = presets.filter(
    (p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  async function handleSelect(preset: JobPreset) {
    const result = await applyPresetToJob(jobId, preset.id);
    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Added "${preset.name}" items`);
      onDone();
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <Input
          placeholder="Search presets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-700">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No presets match</p>
        ) : (
          filtered.map((preset) => {
            const items = preset.line_items as PresetLineItem[];
            const total = items.reduce(
              (sum, item) => sum + (item.quantity || 0) * (item.unit_cost || 0),
              0
            );
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelect(preset)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors border-b border-stone-100 dark:border-stone-800 last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{preset.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {items.map((item) => item.description).join(", ")}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">
                  {formatCurrency(total)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Catalog Tab ──────────────────────────────────────────────

function CatalogTab({
  jobId,
  onDone,
}: {
  jobId: string;
  onDone: () => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!search.trim()) {
        // Show popular items when no search
        const supabase = createClient();
        const { data } = await supabase
          .from("catalog_items")
          .select("*")
          .eq("is_active", true)
          .order("usage_count", { ascending: false })
          .limit(20);
        setResults(data || []);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("catalog_items")
        .select("*")
        .eq("is_active", true)
        .ilike("description", `%${search.trim()}%`)
        .order("usage_count", { ascending: false })
        .limit(20);
      setResults(data || []);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  async function handleAdd(item: CatalogItem) {
    setAdding(item.id);
    const result = await createLineItem({
      job_id: jobId,
      type: item.type,
      description: item.description,
      quantity: item.default_quantity,
      unit_cost: item.default_unit_cost,
      cost: item.type === "part" ? (item.default_cost ?? null) : null,
      part_number: item.part_number || "",
      category: item.category || "",
    });
    setAdding(null);

    if ("error" in result && result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Failed to add");
    } else {
      toast.success(`Added "${item.description}"`);
      incrementUsageCount(item.id);
    }
  }

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, CatalogItem[]> = {};
    for (const item of results) {
      const cat = item.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  }, [results]);

  const categoryNames = Object.keys(grouped).sort((a, b) => {
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <Input
          placeholder="Search catalog..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {results.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No items found</p>
        ) : (
          categoryNames.map((catName) => (
            <div key={catName} className="mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-1 px-1">
                {catName}
              </p>
              <div className="rounded-lg border border-stone-200 dark:border-stone-700">
                {grouped[catName].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={adding === item.id}
                    onClick={() => handleAdd(item)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors border-b border-stone-100 dark:border-stone-800 last:border-b-0 disabled:opacity-50"
                  >
                    <div
                      className={cn(
                        "h-5 w-1 shrink-0 rounded-full",
                        item.type === "labor" ? "bg-blue-400" : "bg-amber-400"
                      )}
                    />
                    <span className="flex-1 truncate font-medium">{item.description}</span>
                    <span className="text-[10px] font-black uppercase text-stone-400 shrink-0">
                      {item.type}
                    </span>
                    <span className="text-xs tabular-nums text-stone-500 shrink-0">
                      {formatCurrency(item.default_unit_cost)}
                    </span>
                    <Plus className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Custom Tab ───────────────────────────────────────────────

function CustomTab({
  jobId,
  categories,
  onDone,
}: {
  jobId: string;
  categories: string[];
  onDone: () => void;
}) {
  return (
    <LineItemForm
      jobId={jobId}
      categories={categories}
      open={true}
      onOpenChange={(open) => {
        if (!open) onDone();
      }}
      inline
    />
  );
}
