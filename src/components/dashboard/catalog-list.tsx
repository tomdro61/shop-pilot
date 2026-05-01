"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CatalogItemForm } from "@/components/forms/catalog-item-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteCatalogItem } from "@/lib/actions/catalog";
import { formatCurrency } from "@/lib/utils/format";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CatalogItem } from "@/types";

interface CatalogListProps {
  items: CatalogItem[];
  categories: string[];
}

type TypeFilter = "all" | "labor" | "part";

export function CatalogList({ items, categories }: CatalogListProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (
        search.trim() &&
        !item.description.toLowerCase().includes(search.trim().toLowerCase())
      )
        return false;
      return true;
    });
  }, [items, search, typeFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, CatalogItem[]> = {};
    for (const item of filtered) {
      const cat = item.category || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  }, [filtered]);

  const categoryNames = Object.keys(grouped).sort((a, b) => {
    if (a === "Uncategorized") return 1;
    if (b === "Uncategorized") return -1;
    return a.localeCompare(b);
  });

  async function handleDelete(id: string) {
    const result = await deleteCatalogItem(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Catalog item deleted");
    }
    return result;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400 pointer-events-none" />
          <Input
            placeholder="Search catalog…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-stone-200 dark:bg-stone-900 dark:border-stone-800"
          />
        </div>
        <div className="flex gap-1 rounded-md border border-stone-200 dark:border-stone-800 bg-card p-1 self-start">
          {(["all", "labor", "part"] as TypeFilter[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              aria-pressed={typeFilter === t}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-medium transition-colors capitalize",
                typeFilter === t
                  ? "bg-stone-100 text-stone-900 shadow-card dark:bg-stone-800 dark:text-stone-50"
                  : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="sm:ml-1">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add Item</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {items.length === 0
                ? "No catalog items yet. Add your first one to speed up building jobs."
                : "No items match your search."}
            </p>
          </div>
        ) : (
          categoryNames.map((catName, catIdx) => {
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
                  {grouped[catName].length}
                </span>
              </div>

              {grouped[catName].map((item) => (
                <div
                  key={item.id}
                  className="group relative flex items-start gap-3 px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 last:border-b-0"
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
                        {formatCurrency(item.default_quantity * item.default_unit_cost)}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono tabular-nums text-xs text-stone-500 dark:text-stone-400">
                      {item.default_quantity} × {formatCurrency(item.default_unit_cost)}
                      {item.usage_count > 0 && ` · used ${item.usage_count}×`}
                    </p>
                  </div>
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
                      title="Delete Catalog Item"
                      description={`Delete "${item.description}"? This won't affect existing jobs.`}
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
          })
        )}
      </div>

      <CatalogItemForm
        categories={categories}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      {editItem && (
        <CatalogItemForm
          item={editItem}
          categories={categories}
          open={!!editItem}
          onOpenChange={(open) => {
            if (!open) setEditItem(null);
          }}
        />
      )}
    </div>
  );
}
