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
import { SECTION_LABEL } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, BookmarkPlus, Search } from "lucide-react";
import type { JobLineItem, JobPreset, PresetLineItem, ShopSettings, CatalogItem } from "@/types";

interface LineItemsListProps {
  jobId: string;
  lineItems: JobLineItem[];
  settings?: ShopSettings | null;
}

export function LineItemsAddButton({
  jobId,
  settings,
  presets = [],
}: {
  jobId: string;
  settings?: ShopSettings | null;
  presets?: JobPreset[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add
      </Button>
      <AddItemSheet
        jobId={jobId}
        presets={presets}
        categories={((settings?.job_categories ?? DEFAULT_SETTINGS.job_categories) as string[])}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function LineItemsList({ jobId, lineItems, settings }: LineItemsListProps) {
  const [editItem, setEditItem] = useState<JobLineItem | null>(null);

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
    <div className="bg-card border border-stone-300 dark:border-stone-800 rounded-lg overflow-hidden">
      {lineItems.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            No line items yet. Tap Add to get started.
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
                <div className="flex items-center justify-between px-4 py-2 border-b border-stone-200 dark:border-stone-800">
                  <h4 className={SECTION_LABEL}>{catName}</h4>
                  <span className="font-mono tabular-nums text-xs text-stone-500 dark:text-stone-400">
                    {formatCurrency(catTotal)}
                  </span>
                </div>

                {/* Rows */}
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "group flex items-start gap-3 px-4 py-2.5 border-b border-stone-100 dark:border-stone-800/60 border-l-2",
                      item.type === "labor" ? "border-l-blue-500" : "border-l-amber-500"
                    )}
                  >
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
                        {item.type === "part" && item.cost != null && (
                          <span>
                            {" · "}cost {formatCurrency(item.cost)}
                            {" · "}
                            {item.unit_cost > 0
                              ? ((item.unit_cost - item.cost) / item.unit_cost * 100).toFixed(0)
                              : 0}
                            % margin
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Save to catalog"
                        onClick={() => handleSaveToCatalog(item)}
                      >
                        <BookmarkPlus className="h-3 w-3" />
                      </Button>
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
                  </div>
                ))}
              </div>
            );
          })}

          {/* Totals */}
          <div className="px-4 py-3 border-t border-stone-300 dark:border-stone-800">
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
            <div className="mt-2 pt-2 border-t border-stone-300 dark:border-stone-700 flex items-baseline justify-between">
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
        <LineItemForm
          jobId={jobId}
          lineItem={editItem}
          categories={((settings?.job_categories ?? DEFAULT_SETTINGS.job_categories) as string[])}
          open={!!editItem}
          onOpenChange={(open) => {
            if (!open) setEditItem(null);
          }}
        />
      )}
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
      <SheetContent side="bottom" className="h-[92vh] max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add to Job</SheetTitle>
        </SheetHeader>

        {/* Tabs */}
        <div className="mt-3 flex gap-1 mb-4 border-b border-stone-300 dark:border-stone-800">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "text-xs font-medium px-3 py-2 -mb-px border-b-2 transition-colors",
                tab === t.key
                  ? "border-blue-600 text-stone-900 dark:text-stone-50 dark:border-blue-400"
                  : "border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
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
      <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-stone-300 dark:border-stone-700">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-500 dark:text-stone-400">No presets match</p>
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
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors border-b border-stone-100 dark:border-stone-800 last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{preset.name}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                    {items.map((item) => item.description).join(", ")}
                  </p>
                </div>
                <span className="font-mono text-sm tabular-nums text-stone-900 dark:text-stone-50 shrink-0">
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
  onDone: _onDone,
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
      type: item.type as "labor" | "part",
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
      <div className="max-h-[60vh] overflow-y-auto">
        {results.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-500 dark:text-stone-400">No items found</p>
        ) : (
          categoryNames.map((catName) => (
            <div key={catName} className="mb-3">
              <p className={`${SECTION_LABEL} mb-1 px-1`}>{catName}</p>
              <div className="rounded-lg border border-stone-300 dark:border-stone-700">
                {grouped[catName].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={adding === item.id}
                    onClick={() => handleAdd(item)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors border-b border-stone-100 dark:border-stone-800 last:border-b-0 disabled:opacity-50"
                  >
                    <div
                      className={cn(
                        "h-5 w-1 shrink-0 rounded-full",
                        item.type === "labor" ? "bg-blue-400" : "bg-amber-400"
                      )}
                    />
                    <span className="flex-1 truncate">{item.description}</span>
                    <span className="text-[10px] uppercase tracking-wider text-stone-400 shrink-0">
                      {item.type}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-stone-500 shrink-0">
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
