"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PresetForm } from "@/components/forms/preset-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deletePreset } from "@/lib/actions/presets";
import { formatCurrency } from "@/lib/utils/format";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { JobPreset, PresetLineItem } from "@/types";

interface PresetListProps {
  presets: JobPreset[];
  categories: string[];
}

export function PresetList({ presets, categories }: PresetListProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editPreset, setEditPreset] = useState<JobPreset | null>(null);

  async function handleDelete(id: string) {
    const result = await deletePreset(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Preset deleted");
    }
    return result;
  }

  function getPresetTotal(preset: JobPreset): number {
    const items = preset.line_items as PresetLineItem[];
    return items.reduce(
      (sum, item) => sum + (item.quantity || 0) * (item.unit_cost || 0),
      0
    );
  }

  function getLineItemCount(preset: JobPreset): number {
    return (preset.line_items as PresetLineItem[]).length;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold tracking-tight text-stone-900 dark:text-stone-50">
          Job Presets
          <span className="ml-2 font-mono tabular-nums text-xs text-stone-500 dark:text-stone-400">
            {presets.length}
          </span>
        </h2>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add Preset</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
        {presets.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              No presets yet. Create one to speed up job creation.
            </p>
          </div>
        ) : (
          presets.map((preset) => {
            const itemCount = getLineItemCount(preset);
            const items = preset.line_items as PresetLineItem[];
            const total = getPresetTotal(preset);
            return (
              <div
                key={preset.id}
                className="group flex items-start gap-3 px-4 py-2.5 border-b border-stone-100 dark:border-stone-800/60 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                        {preset.name}
                      </p>
                      {preset.category && (
                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                          {preset.category}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-mono tabular-nums text-sm font-medium text-stone-900 dark:text-stone-50">
                      {formatCurrency(total)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400 truncate">
                    {itemCount} item{itemCount !== 1 ? "s" : ""} · {items.map((item) => item.description).join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Edit"
                    onClick={() => setEditPreset(preset)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <DeleteConfirmDialog
                    title="Delete Preset"
                    description={`Delete "${preset.name}"? This won't affect existing jobs.`}
                    onConfirm={() => handleDelete(preset.id)}
                    trigger={
                      <Button variant="ghost" size="icon-xs" title="Delete">
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    }
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      <PresetForm
        categories={categories}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      {editPreset && (
        <PresetForm
          preset={editPreset}
          categories={categories}
          open={!!editPreset}
          onOpenChange={(open) => {
            if (!open) setEditPreset(null);
          }}
        />
      )}
    </div>
  );
}
