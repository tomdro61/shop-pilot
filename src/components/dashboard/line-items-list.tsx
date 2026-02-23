"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LineItemForm } from "@/components/forms/line-item-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteLineItem } from "@/lib/actions/job-line-items";
import { formatCurrency } from "@/lib/utils/format";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { JobLineItem } from "@/types";

interface LineItemsListProps {
  jobId: string;
  lineItems: JobLineItem[];
  jobCategory?: string | null;
}

export function LineItemsList({ jobId, lineItems, jobCategory }: LineItemsListProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<JobLineItem | null>(null);

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
    const cat = li.category || jobCategory || "Uncategorized";
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(li);
  });

  const categoryNames = Object.keys(categoryGroups);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b">
        <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Line Items</CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Item
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {lineItems.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">
            No line items yet. Add labor or parts.
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
                    <span className="text-sm text-muted-foreground">{formatCurrency(catTotal)}</span>
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
        jobCategory={jobCategory}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      {editItem && (
        <LineItemForm
          jobId={jobId}
          jobCategory={jobCategory}
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
