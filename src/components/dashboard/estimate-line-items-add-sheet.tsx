"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { SECTION_LABEL } from "@/components/ui/section-card";
import { EstimateLineItemForm } from "@/components/forms/estimate-line-item-form";
import { applyPresetToEstimate } from "@/lib/actions/presets";
import { createEstimateLineItem } from "@/lib/actions/estimates";
import { incrementUsageCount } from "@/lib/actions/catalog";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Plus, Search } from "lucide-react";
import type { JobPreset, PresetLineItem, CatalogItem } from "@/types";

type AddTab = "presets" | "catalog" | "custom";

interface EstimateLineItemsAddSheetProps {
  estimateId: string;
  presets: JobPreset[];
  categories: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EstimateLineItemsAddSheet({
  estimateId,
  presets,
  categories,
  open,
  onOpenChange,
}: EstimateLineItemsAddSheetProps) {
  const [tab, setTab] = useState<AddTab>(presets.length > 0 ? "presets" : "catalog");

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
          <SheetTitle>Add to Estimate</SheetTitle>
        </SheetHeader>

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

        {tab === "presets" && (
          <PresetsTab presets={presets} estimateId={estimateId} onDone={() => onOpenChange(false)} />
        )}
        {tab === "catalog" && <CatalogTab estimateId={estimateId} />}
        {tab === "custom" && (
          <CustomTab estimateId={estimateId} categories={categories} onDone={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function PresetsTab({
  presets,
  estimateId,
  onDone,
}: {
  presets: JobPreset[];
  estimateId: string;
  onDone: () => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = presets.filter(
    (p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  async function handleSelect(preset: JobPreset) {
    const result = await applyPresetToEstimate(estimateId, preset.id);
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

// Catalog stays open after each add — managers commonly add multiple
// items in one session (e.g., oil filter + drain plug + oil) and the
// sheet's bottom-of-screen close affordance is enough.
function CatalogTab({ estimateId }: { estimateId: string }) {
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
        // A silent empty result hides "search failed" as "no items" —
        // toast so the manager doesn't conclude the catalog is empty and
        // re-add an item that's already in there.
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
    const result = await createEstimateLineItem({
      estimate_id: estimateId,
      type: item.type as "labor" | "part",
      description: item.description,
      quantity: item.default_quantity,
      unit_cost: item.default_unit_cost,
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

function CustomTab({
  estimateId,
  categories,
  onDone,
}: {
  estimateId: string;
  categories: string[];
  onDone: () => void;
}) {
  return (
    <EstimateLineItemForm
      kind="inline"
      estimateId={estimateId}
      categories={categories}
      onDone={onDone}
    />
  );
}
