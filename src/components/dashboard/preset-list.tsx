"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    <div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Job Presets ({presets.length})
          </CardTitle>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Add Preset</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </CardHeader>
        <CardContent>
          {presets.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No presets yet. Create one to speed up job creation.
            </p>
          ) : (
            <div className="-mx-5 divide-y">
              {presets.map((preset) => {
                const items = preset.line_items as PresetLineItem[];
                return (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{preset.name}</p>
                        {preset.category && (
                          <Badge variant="secondary" className="text-xs">
                            {preset.category}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {getLineItemCount(preset)} item{getLineItemCount(preset) !== 1 ? "s" : ""}
                        {" \u00B7 "}
                        {items
                          .map((item) => item.description)
                          .join(", ")}
                        {" \u00B7 "}
                        {formatCurrency(getPresetTotal(preset))}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditPreset(preset)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <DeleteConfirmDialog
                        title="Delete Preset"
                        description={`Delete "${preset.name}"? This won't affect existing jobs.`}
                        onConfirm={() => handleDelete(preset.id)}
                        trigger={
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
