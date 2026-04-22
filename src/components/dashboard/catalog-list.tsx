"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  // Group by category
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
    <div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Parts & Labor Catalog ({items.length})
          </CardTitle>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Add Item</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                placeholder="Search catalog..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1">
              {(["all", "labor", "part"] as TypeFilter[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    "text-[10px] font-black px-3 py-1.5 rounded-md uppercase transition-colors",
                    typeFilter === t
                      ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                      : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700"
                  )}
                >
                  {t === "all" ? "All" : t}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {items.length === 0
                ? "No catalog items yet. Add your first one to speed up building jobs."
                : "No items match your search."}
            </p>
          ) : (
            <div className="space-y-6">
              {categoryNames.map((catName) => (
                <div key={catName}>
                  <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500">
                    {catName} ({grouped[catName].length})
                  </h3>
                  <div className="divide-y divide-stone-100 dark:divide-stone-800">
                    {grouped[catName].map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50"
                      >
                        {/* Type color bar */}
                        <div
                          className={cn(
                            "h-8 w-1 shrink-0 rounded-full",
                            item.type === "labor"
                              ? "bg-blue-400"
                              : "bg-amber-400"
                          )}
                        />

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold truncate">
                              {item.description}
                            </p>
                            <span
                              className={cn(
                                "text-[10px] font-black px-2 py-0.5 rounded-md uppercase shrink-0",
                                item.type === "labor"
                                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                                  : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                              )}
                            >
                              {item.type}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {item.default_quantity} × {formatCurrency(item.default_unit_cost)}
                            {item.part_number && ` · #${item.part_number}`}
                            {item.usage_count > 0 && ` · used ${item.usage_count}×`}
                          </p>
                        </div>

                        {/* Price */}
                        <p className="text-sm font-semibold tabular-nums shrink-0">
                          {formatCurrency(
                            item.default_quantity * item.default_unit_cost
                          )}
                        </p>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditItem(item)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <DeleteConfirmDialog
                            title="Delete Catalog Item"
                            description={`Delete "${item.description}"? This won't affect existing jobs.`}
                            onConfirm={() => handleDelete(item.id)}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
