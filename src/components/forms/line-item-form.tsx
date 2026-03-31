"use client";

import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { lineItemSchema, type LineItemFormData } from "@/lib/validators/job";
import { createLineItem, updateLineItem } from "@/lib/actions/job-line-items";
import { incrementUsageCount } from "@/lib/actions/catalog";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import type { JobLineItem, CatalogItem } from "@/types";

interface LineItemFormProps {
  jobId: string;
  lineItem?: JobLineItem;
  defaultCategory?: string;
  categories?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inline?: boolean;
}

export function LineItemForm({
  jobId,
  lineItem,
  defaultCategory,
  categories = [],
  open,
  onOpenChange,
  inline,
}: LineItemFormProps) {
  const isEditing = !!lineItem;
  const categoryLocked = !isEditing && !!defaultCategory;

  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogResults, setCatalogResults] = useState<CatalogItem[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Search catalog items
  useEffect(() => {
    if (!open || isEditing) return;
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
        .ilike("description", `%${catalogSearch.trim()}%`)
        .order("usage_count", { ascending: false })
        .limit(10);
      setCatalogResults(data || []);
      setCatalogOpen(true);
    }, 200);
    return () => clearTimeout(timer);
  }, [catalogSearch, open, isEditing]);

  function selectCatalogItem(item: CatalogItem) {
    form.setValue("type", item.type as "labor" | "part");
    form.setValue("description", item.description);
    form.setValue("quantity", item.default_quantity);
    form.setValue("unit_cost", item.default_unit_cost);
    form.setValue("cost", item.type === "part" ? (item.default_cost ?? null) : null);
    form.setValue("part_number", item.part_number || "");
    if (!categoryLocked && item.category) {
      form.setValue("category", item.category);
    }
    setSelectedCatalogId(item.id);
    setCatalogOpen(false);
    setCatalogSearch("");
  }

  const form = useForm<LineItemFormData>({
    resolver: zodResolver(lineItemSchema),
    defaultValues: {
      job_id: jobId,
      type: lineItem?.type || "labor",
      description: lineItem?.description || "",
      quantity: lineItem?.quantity || 1,
      unit_cost: lineItem?.unit_cost || 0,
      cost: lineItem?.cost ?? null,
      part_number: lineItem?.part_number || "",
      category: lineItem?.category || defaultCategory || "",
    },
  });

  useEffect(() => {
    if (open && !isEditing) {
      form.reset({
        job_id: jobId,
        type: "labor",
        description: "",
        quantity: 1,
        unit_cost: 0,
        cost: null,
        part_number: "",
        category: defaultCategory || "",
      });
      setCatalogSearch("");
      setCatalogResults([]);
      setCatalogOpen(false);
      setSelectedCatalogId(null);
    }
  }, [open, defaultCategory, isEditing, form, jobId]);

  const watchType = form.watch("type");
  const quantity = form.watch("quantity");
  const unitCost = form.watch("unit_cost");
  const watchCost = form.watch("cost");
  const total = (Number(quantity) || 0) * (Number(unitCost) || 0);
  const marginPct = watchType === "part" && watchCost && unitCost
    ? ((unitCost - watchCost) / unitCost) * 100
    : null;

  async function onSubmit(data: LineItemFormData) {
    const cleaned = {
      ...data,
      quantity: Number(data.quantity),
      unit_cost: Number(data.unit_cost),
      cost: data.type === "part" && data.cost != null ? Number(data.cost) : null,
    };

    const result = isEditing
      ? await updateLineItem(lineItem.id, cleaned)
      : await createLineItem(cleaned);

    if ("error" in result && result.error) {
      if (typeof result.error === "string") {
        toast.error(result.error);
      } else {
        toast.error("Please fix the form errors");
      }
      return;
    }

    // Bump catalog usage count
    if (selectedCatalogId) {
      incrementUsageCount(selectedCatalogId);
    }

    toast.success(isEditing ? "Line item updated" : "Line item added");
    onOpenChange(false);
    setSelectedCatalogId(null);
    form.reset({
      job_id: jobId,
      type: "labor",
      description: "",
      quantity: 1,
      unit_cost: 0,
      cost: null,
      part_number: "",
      category: "",
    });
  }

  const formContent = (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className={cn(inline ? "space-y-3" : "mt-3 space-y-3")}
          >
            <input type="hidden" {...form.register("job_id")} />

            {/* Catalog search */}
            {!isEditing && (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <Input
                    ref={searchRef}
                    placeholder="Search catalog..."
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    onFocus={() => catalogResults.length > 0 && setCatalogOpen(true)}
                    className="pl-9"
                  />
                </div>
                {catalogOpen && catalogResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-900 max-h-48 overflow-y-auto">
                    {catalogResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                        onClick={() => selectCatalogItem(item)}
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

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="labor">Labor</SelectItem>
                      <SelectItem value="part">Part</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!categoryLocked && (
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="No category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">No category</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="Brake pad replacement" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="rounded-lg bg-stone-100 dark:bg-stone-950 p-3 text-center">
              <span className="text-sm text-stone-500 dark:text-stone-400">Total: </span>
              <span className="text-lg font-semibold">
                {formatCurrency(total)}
              </span>
              {marginPct !== null && (
                <span className={`ml-2 text-sm font-medium ${marginPct >= 30 ? "text-green-600 dark:text-green-400" : marginPct >= 15 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                  ({marginPct.toFixed(1)}% margin)
                </span>
              )}
            </div>

            {watchType === "part" && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="part_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Part Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Cost</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Wholesale"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? "Saving..."
                  : isEditing
                    ? "Update"
                    : "Add"}
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
        </Form>
  );

  if (inline) return formContent;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Edit Line Item" : defaultCategory ? `Add ${defaultCategory} Item` : "Add Line Item"}
          </SheetTitle>
        </SheetHeader>
        {formContent}
      </SheetContent>
    </Sheet>
  );
}
