"use client";

import { useState, useEffect, useMemo, useTransition, useOptimistic } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LineItemForm } from "@/components/forms/line-item-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteLineItem, createLineItem } from "@/lib/actions/job-line-items";
import { saveToCatalog, incrementUsageCount } from "@/lib/actions/catalog";
import { applyPresetToJob } from "@/lib/actions/presets";
import { setJobChargeSalesTax } from "@/lib/actions/jobs";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/format";
import { calculateTotals, resolveConfiguredCategories } from "@/lib/utils/totals";
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
  chargeSalesTax: boolean;
  // Tax can't change after the job is invoiced — render the toggle read-only.
  salesTaxLocked: boolean;
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
        categories={resolveConfiguredCategories(settings)}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function LineItemsList({ jobId, lineItems, settings, chargeSalesTax, salesTaxLocked }: LineItemsListProps) {
  const router = useRouter();
  const [editItem, setEditItem] = useState<JobLineItem | null>(null);
  // Optimistic so the toggle + totals flip instantly. useOptimistic auto-reverts
  // to the server value when the transition ends: on error there's no refresh, so
  // it snaps back; on success router.refresh() updates the prop and it re-syncs.
  const [optimisticCharge, setOptimisticCharge] = useOptimistic(chargeSalesTax);
  const [taxPending, startTaxTransition] = useTransition();

  const totals = calculateTotals(lineItems, settings, optimisticCharge);

  function handleToggleTax(next: boolean) {
    startTaxTransition(async () => {
      setOptimisticCharge(next);
      const res = await setJobChargeSalesTax(jobId, next);
      if (res && "error" in res && res.error) {
        toast.error(res.error);
      } else {
        router.refresh();
      }
    });
  }

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
    if ("error" in result && result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Failed to save");
    } else if ("updated" in result && result.updated) {
      toast.success("Updated cost in catalog");
    } else if ("duplicate" in result && result.duplicate) {
      toast.info("Already in catalog");
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

  if (lineItems.length === 0) {
    return (
      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden px-4 py-10 text-center">
        <p className="text-sm text-stone-500 dark:text-stone-400">
          No line items yet. Tap Add to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
      {/* Category groups — sections within one container */}
      {categoryNames.map((catName, catIdx) => {
        const items = categoryGroups[catName];
        const catTotal = items.reduce((sum, li) => sum + (li.total || 0), 0);
        const isFirst = catIdx === 0;

        return (
          <div key={catName}>
            <div
              className={cn(
                "flex items-center justify-between gap-3 px-4 py-2.5 bg-stone-50 dark:bg-stone-900/60 border-b border-stone-200 dark:border-stone-800",
                !isFirst && "border-t-2"
              )}
            >
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-400 truncate">
                {catName}
              </h4>
              <span className="font-mono tabular-nums text-xs font-semibold text-stone-700 dark:text-stone-300 shrink-0">
                {formatCurrency(catTotal)}
              </span>
            </div>

            {items.map((item) => (
                  <div
                    key={item.id}
                    className="group relative flex items-start gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-800"
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

      {/* Totals — same card, separated by a stronger top border */}
      <div className="px-4 py-3 bg-stone-50/60 dark:bg-stone-900/40 border-t-2 border-stone-200 dark:border-stone-800">
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
        {/* Per-job sales-tax toggle. Off = bill parts with no tax (e.g. outsourced
            parts the shop didn't buy). Locked once the job is invoiced. */}
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-stone-500 dark:text-stone-400">
            Charge sales tax
            {salesTaxLocked && (
              <span className="ml-1.5 text-[10px] text-stone-400 dark:text-stone-500">
                locked · invoiced
              </span>
            )}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={optimisticCharge}
            aria-label="Charge sales tax on this job"
            disabled={salesTaxLocked || taxPending}
            onClick={() => handleToggleTax(!optimisticCharge)}
            className={cn(
              "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              optimisticCharge ? "bg-blue-600" : "bg-stone-300 dark:bg-stone-700"
            )}
          >
            <span
              className={cn(
                "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
                optimisticCharge ? "translate-x-3.5" : "translate-x-0.5"
              )}
            />
          </button>
        </div>
        <div className="mt-2 pt-2 border-t border-stone-200 dark:border-stone-700 flex items-baseline justify-between">
          <span className={SECTION_LABEL}>Total</span>
          <span className="font-mono tabular-nums text-base font-semibold text-stone-900 dark:text-stone-50">
            {formatCurrency(totals.grandTotal)}
          </span>
        </div>
      </div>

      {/* Edit form */}
      {editItem && (
        <LineItemForm
          jobId={jobId}
          lineItem={editItem}
          categories={resolveConfiguredCategories(settings)}
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
        <div className="mt-3 flex gap-1 mb-4 border-b border-stone-200 dark:border-stone-800">
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
      return;
    }
    if ("inserted" in result && result.inserted === 0) {
      toast.info(`"${preset.name}" has no line items`);
      return;
    }
    toast.success(`Added "${preset.name}" items`);
    onDone();
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
      <div className="max-h-[60vh] overflow-y-auto rounded-md border border-stone-200 dark:border-stone-700">
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
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors border-b border-stone-200 dark:border-stone-800 last:border-b-0"
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
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const supabase = createClient();
      let query = supabase
        .from("catalog_items")
        .select("*")
        .eq("is_active", true)
        .order("usage_count", { ascending: false })
        .limit(20)
        .abortSignal(controller.signal);
      if (search.trim()) {
        query = query.ilike("description", `%${search.trim()}%`);
      }
      const { data, error } = await query;
      if (controller.signal.aborted) return;
      if (error) {
        // Silent empty results would hide "search failed" as "no items" —
        // toast so the manager doesn't add a duplicate of something already
        // in the catalog.
        console.error("[CatalogTab] catalog search failed:", error);
        toast.error("Couldn't load catalog — try again");
        setResults([]);
        return;
      }
      setResults(data ?? []);
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
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
      category: item.category || undefined,
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
              <div className="rounded-md border border-stone-200 dark:border-stone-700">
                {grouped[catName].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={adding === item.id}
                    onClick={() => handleAdd(item)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors border-b border-stone-200 dark:border-stone-800 last:border-b-0 disabled:opacity-50"
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
