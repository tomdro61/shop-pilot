"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createPreset, updatePreset } from "@/lib/actions/presets";
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
import { Plus, Trash2 } from "lucide-react";
import type { JobPreset, PresetLineItem } from "@/types";

interface PresetFormProps {
  preset?: JobPreset;
  categories?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const emptyLineItem: PresetLineItem = {
  type: "labor",
  description: "",
  quantity: 1,
  unit_cost: 0,
};

export function PresetForm({ preset, categories = [], open, onOpenChange }: PresetFormProps) {
  const isEditing = !!preset;

  const [name, setName] = useState(preset?.name || "");
  const [category, setCategory] = useState(preset?.category || "");
  const [lineItems, setLineItems] = useState<PresetLineItem[]>(
    preset ? (preset.line_items as PresetLineItem[]) : [{ ...emptyLineItem }]
  );
  const [submitting, setSubmitting] = useState(false);

  const total = lineItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0),
    0
  );

  function updateLineItem(index: number, updates: Partial<PresetLineItem>) {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item))
    );
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, { ...emptyLineItem }]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    const validItems = lineItems.filter((item) => item.description.trim());
    if (validItems.length === 0) {
      toast.error("Add at least one line item");
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
        ...(item.part_number ? { part_number: item.part_number } : {}),
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

    if (!isEditing) {
      setName("");
      setCategory("");
      setLineItems([{ ...emptyLineItem }]);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit Preset" : "New Preset"}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-3 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="preset-name">Name</Label>
            <Input
              id="preset-name"
              placeholder="e.g. Oil Change"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select category..." />
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add
              </Button>
            </div>

            {lineItems.map((item, index) => (
              <div key={index} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Select
                    value={item.type}
                    onValueChange={(val) =>
                      updateLineItem(index, { type: val as "labor" | "part" })
                    }
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="labor">Labor</SelectItem>
                      <SelectItem value="part">Part</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Description"
                    className="flex-1"
                    value={item.description}
                    onChange={(e) =>
                      updateLineItem(index, { description: e.target.value })
                    }
                  />
                  {lineItems.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removeLineItem(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="w-20">
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) =>
                        updateLineItem(index, { quantity: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Unit cost"
                      value={item.unit_cost}
                      onChange={(e) =>
                        updateLineItem(index, { unit_cost: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  {item.type === "part" && (
                    <Input
                      placeholder="Part #"
                      className="flex-1"
                      value={item.part_number || ""}
                      onChange={(e) =>
                        updateLineItem(index, { part_number: e.target.value })
                      }
                    />
                  )}
                  <div className="flex w-24 items-center justify-end text-sm font-medium">
                    {formatCurrency((Number(item.quantity) || 0) * (Number(item.unit_cost) || 0))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md bg-stone-100 dark:bg-stone-950 p-3 text-center">
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
