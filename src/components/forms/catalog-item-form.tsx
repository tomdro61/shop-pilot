"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createCatalogItem, updateCatalogItem } from "@/lib/actions/catalog";
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
import type { CatalogItem } from "@/types";

interface CatalogItemFormProps {
  item?: CatalogItem;
  categories?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CatalogItemForm({
  item,
  categories = [],
  open,
  onOpenChange,
}: CatalogItemFormProps) {
  const isEditing = !!item;

  const [type, setType] = useState<"labor" | "part">(item?.type || "part");
  const [description, setDescription] = useState(item?.description || "");
  const [defaultQuantity, setDefaultQuantity] = useState(
    item?.default_quantity ?? 1
  );
  const [defaultUnitCost, setDefaultUnitCost] = useState(
    item?.default_unit_cost ?? 0
  );
  const [defaultCost, setDefaultCost] = useState<number | null>(
    item?.default_cost ?? null
  );
  const [partNumber, setPartNumber] = useState(item?.part_number || "");
  const [category, setCategory] = useState(item?.category || "");
  const [submitting, setSubmitting] = useState(false);

  const total = (Number(defaultQuantity) || 0) * (Number(defaultUnitCost) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!description.trim()) {
      toast.error("Description is required");
      return;
    }

    setSubmitting(true);

    const formData = {
      type,
      description: description.trim(),
      default_quantity: Number(defaultQuantity) || 1,
      default_unit_cost: Number(defaultUnitCost) || 0,
      default_cost: type === "part" && defaultCost != null ? Number(defaultCost) : null,
      part_number: type === "part" ? partNumber || undefined : undefined,
      category: category || undefined,
    };

    const result = isEditing
      ? await updateCatalogItem(item.id, formData)
      : await createCatalogItem(formData);

    setSubmitting(false);

    if ("error" in result && result.error) {
      toast.error(
        typeof result.error === "string" ? result.error : "Something went wrong"
      );
      return;
    }

    toast.success(isEditing ? "Catalog item updated" : "Catalog item added");
    onOpenChange(false);

    if (!isEditing) {
      setType("part");
      setDescription("");
      setDefaultQuantity(1);
      setDefaultUnitCost(0);
      setDefaultCost(null);
      setPartNumber("");
      setCategory("");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Edit Catalog Item" : "Add Catalog Item"}
          </SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-3 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(val) => setType(val as "labor" | "part")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="labor">Labor</SelectItem>
                  <SelectItem value="part">Part</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
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

          <div className="space-y-1.5">
            <Label htmlFor="catalog-description">Description</Label>
            <Input
              id="catalog-description"
              placeholder="e.g. Front Brake Pads"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="catalog-qty">Default Quantity</Label>
              <Input
                id="catalog-qty"
                type="number"
                step="0.01"
                min="0.01"
                value={defaultQuantity}
                onChange={(e) => setDefaultQuantity(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catalog-price">Default Price</Label>
              <Input
                id="catalog-price"
                type="number"
                step="0.01"
                min="0"
                value={defaultUnitCost}
                onChange={(e) =>
                  setDefaultUnitCost(Number(e.target.value) || 0)
                }
              />
            </div>
          </div>

          {type === "part" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="catalog-cost">Your Cost</Label>
                <Input
                  id="catalog-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Wholesale"
                  value={defaultCost ?? ""}
                  onChange={(e) =>
                    setDefaultCost(
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="catalog-part-number">Part Number</Label>
                <Input
                  id="catalog-part-number"
                  placeholder="Optional"
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="rounded-lg bg-stone-100 dark:bg-stone-950 p-3 text-center">
            <span className="text-sm text-stone-500 dark:text-stone-400">
              Default Total:{" "}
            </span>
            <span className="text-lg font-semibold">
              {formatCurrency(total)}
            </span>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : isEditing ? "Update" : "Add"}
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
