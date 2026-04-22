"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { createPreset, updatePreset } from "@/lib/actions/presets";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Search, Trash2 } from "lucide-react";
import type { JobPreset, PresetLineItem, CatalogItem } from "@/types";

interface PresetFormProps {
  preset?: JobPreset;
  categories?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PresetForm({ preset, categories = [], open, onOpenChange }: PresetFormProps) {
  const isEditing = !!preset;

  const [name, setName] = useState(preset?.name || "");
  const [category, setCategory] = useState(preset?.category || "");
  const [lineItems, setLineItems] = useState<PresetLineItem[]>(
    preset ? (preset.line_items as PresetLineItem[]) : []
  );
  const [submitting, setSubmitting] = useState(false);

  // Catalog search
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogResults, setCatalogResults] = useState<CatalogItem[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);

  // Search catalog items filtered by selected category
  useEffect(() => {
    if (!open || !category) return;
    const timer = setTimeout(async () => {
      if (!catalogSearch.trim()) {
        setCatalogResults([]);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("catalog_items")
        .select("*")
        .eq("is_active", true)
        .eq("category", category)
        .ilike("description", `%${catalogSearch.trim()}%`)
        .order("usage_count", { ascending: false })
        .limit(10);
      setCatalogResults(data || []);
      setCatalogOpen(true);
    }, 200);
    return () => clearTimeout(timer);
  }, [catalogSearch, open, category]);

  // Reset catalog search when sheet opens/closes
  useEffect(() => {
    if (open) {
      setCatalogSearch("");
      setCatalogResults([]);
      setCatalogOpen(false);
      if (!isEditing) {
        setName("");
        setCategory("");
        setLineItems([]);
      }
    }
  }, [open, isEditing]);

  function addCatalogItem(item: CatalogItem) {
    const newLineItem: PresetLineItem = {
      type: item.type as "labor" | "part",
      description: item.description,
      quantity: item.default_quantity,
      unit_cost: item.default_unit_cost,
      ...(item.type === "part" && item.default_cost != null
        ? { cost: item.default_cost }
        : {}),
      ...(item.part_number ? { part_number: item.part_number } : {}),
      ...(category ? { category } : {}),
    };
    setLineItems((prev) => [...prev, newLineItem]);

    setCatalogSearch("");
    setCatalogOpen(false);
  }

  function updateLineItem(index: number, updates: Partial<PresetLineItem>) {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item))
    );
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  const total = lineItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0),
    0
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    const validItems = lineItems.filter((item) => item.description.trim());
    if (validItems.length === 0) {
      toast.error("Add at least one item from the catalog");
      return;
    }

    setSubmitting(true);

    const formData = {
      name: name.trim(),
      category: category || "",
      line_items: validItems.map((item) => ({
        type: item.type,
        description: item.description.trim(),
        quantity: Number(item.quantity) || 1,
        unit_cost: Number(item.unit_cost) || 0,
        ...(item.type === "part" && item.cost != null ? { cost: Number(item.cost) } : {}),
        ...(item.part_number ? { part_number: item.part_number } : {}),
        ...(item.category ? { category: item.category } : {}),
      })),
    };

    const result = isEditing
      ? await updatePreset(preset.id, formData)
      : await createPreset(formData);

    setSubmitting(false);

    if ("error" in result && result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Something went wrong");
      return;
    }

    toast.success(isEditing ? "Preset updated" : "Preset created");
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit Preset" : "New Preset"}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-3 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="preset-name">Name</Label>
              <Input
                id="preset-name"
                placeholder="e.g. Brake Job with Pads"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
              value={category}
              onValueChange={(val) => {
                if (val !== category) {
                  setCategory(val);
                  setLineItems([]);
                  setCatalogSearch("");
                  setCatalogResults([]);
                }
              }}
            >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Catalog search to add items */}
          <div className="space-y-2">
            <Label>Add Items from Catalog</Label>
            {!category ? (
              <p className="text-sm text-muted-foreground py-2">
                Select a category first to search catalog items
              </p>
            ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                placeholder={`Search ${category} catalog items...`}
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                onFocus={() => catalogResults.length > 0 && setCatalogOpen(true)}
                className="pl-9"
              />
              {catalogOpen && catalogResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-stone-300 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-900 max-h-48 overflow-y-auto">
                  {catalogResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                      onClick={() => addCatalogItem(item)}
                    >
                      <div
                        className={cn(
                          "h-5 w-1 shrink-0 rounded-full",
                          item.type === "labor" ? "bg-blue-400" : "bg-amber-400"
                        )}
                      />
                      <span className="flex-1 truncate font-medium">{item.description}</span>
                      <span className="text-[10px] font-black uppercase text-stone-400">
                        {item.type}
                      </span>
                      <span className="text-xs tabular-nums text-stone-500">
                        {formatCurrency(item.default_unit_cost)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>

          {/* Line items list */}
          {lineItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Preset Items ({lineItems.length})</Label>
              </div>

              {lineItems.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-lg border border-stone-300 dark:border-stone-700 px-3 py-2"
                >
                  <div
                    className={cn(
                      "h-6 w-1 shrink-0 rounded-full",
                      item.type === "labor" ? "bg-blue-400" : "bg-amber-400"
                    )}
                  />
                  <span className="flex-1 text-sm font-medium truncate">
                    {item.description}
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={item.quantity}
                    onChange={(e) =>
                      updateLineItem(index, { quantity: Number(e.target.value) || 1 })
                    }
                    className="w-16 h-8 text-xs text-center"
                    title="Quantity"
                  />
                  <span className="w-16 text-right text-xs tabular-nums text-stone-500 shrink-0">
                    {formatCurrency(item.unit_cost)}
                  </span>
                  <span className="w-16 text-right text-xs font-medium tabular-nums shrink-0">
                    {formatCurrency((Number(item.quantity) || 0) * (Number(item.unit_cost) || 0))}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => removeLineItem(index)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {lineItems.length === 0 && (
            <div className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Search the catalog above to add items to this preset
              </p>
            </div>
          )}

          <div className="rounded-lg bg-stone-100 dark:bg-stone-950 p-3 text-center">
            <span className="text-sm text-stone-500 dark:text-stone-400">Total: </span>
            <span className="text-lg font-semibold">{formatCurrency(total)}</span>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : isEditing ? "Update" : "Create"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
