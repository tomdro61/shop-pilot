"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LineItemForm } from "@/components/forms/line-item-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteLineItem } from "@/lib/actions/job-line-items";
import { formatCurrency } from "@/lib/utils/format";
import { DEFAULT_JOB_CATEGORIES } from "@/lib/constants";
import { Plus, Pencil, Trash2, Wrench } from "lucide-react";
import type { JobLineItem } from "@/types";

interface LineItemsListProps {
  jobId: string;
  lineItems: JobLineItem[];
}

export function LineItemsList({ jobId, lineItems }: LineItemsListProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<JobLineItem | null>(null);
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [defaultCategory, setDefaultCategory] = useState<string | undefined>(undefined);

  const grandTotal = lineItems.reduce((sum, li) => sum + (li.total || 0), 0);

  async function handleDelete(id: string) {
    const result = await deleteLineItem(id, jobId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Line item deleted");
    }
    return result;
  }

  function handleAddService(category: string) {
    setServicePickerOpen(false);
    setDefaultCategory(category);
    setAddOpen(true);
  }

  function handleAddItem(category?: string) {
    setDefaultCategory(category);
    setAddOpen(true);
  }

  function renderItems(items: JobLineItem[], label: string) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</h4>
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-md border p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{item.description}</p>
                {item.part_number && (
                  <Badge variant="outline" className="text-xs">
                    #{item.part_number}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {item.quantity} x {formatCurrency(item.unit_cost)} ={" "}
                {formatCurrency(item.total)}
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setEditItem(item)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <DeleteConfirmDialog
                title="Delete Line Item"
                description={`Delete "${item.description}"?`}
                onConfirm={() => handleDelete(item.id)}
                trigger={
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                }
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Group line items by category
  const categoryGroups: Record<string, JobLineItem[]> = {};
  lineItems.forEach((li) => {
    const cat = li.category || "Uncategorized";
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(li);
  });

  const categoryNames = Object.keys(categoryGroups);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b">
        <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Line Items</CardTitle>
        <div className="flex gap-2">
          <Popover open={servicePickerOpen} onOpenChange={setServicePickerOpen}>
            <PopoverTrigger asChild>
              <Button size="sm">
                <Wrench className="mr-2 h-4 w-4" />
                Add Service
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="end">
              <div className="space-y-1">
                {DEFAULT_JOB_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                    onClick={() => handleAddService(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="outline" onClick={() => handleAddItem()}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {lineItems.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">
            No line items yet. Add a service or individual item.
          </p>
        ) : (
          <>
            {categoryNames.map((catName) => {
              const items = categoryGroups[catName];
              const laborItems = items.filter((li) => li.type === "labor");
              const partItems = items.filter((li) => li.type === "part");
              const catTotal = items.reduce((sum, li) => sum + (li.total || 0), 0);

              return (
                <div key={catName} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{catName}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{formatCurrency(catTotal)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleAddItem(catName)}
                        title={`Add item to ${catName}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {renderItems(laborItems, "Labor")}
                  {renderItems(partItems, "Parts")}
                  {categoryNames.length > 1 && <Separator />}
                </div>
              );
            })}
            <div className="text-right">
              <p className="text-2xl font-bold tracking-tight">
                {formatCurrency(grandTotal)}
              </p>
            </div>
          </>
        )}
      </CardContent>

      <LineItemForm
        jobId={jobId}
        defaultCategory={defaultCategory}
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setDefaultCategory(undefined);
        }}
      />

      {editItem && (
        <LineItemForm
          jobId={jobId}
          lineItem={editItem}
          open={!!editItem}
          onOpenChange={(open) => {
            if (!open) setEditItem(null);
          }}
        />
      )}
    </Card>
  );
}
