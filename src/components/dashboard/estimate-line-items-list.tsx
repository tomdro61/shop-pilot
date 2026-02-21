"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EstimateLineItemForm } from "@/components/forms/estimate-line-item-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteEstimateLineItem } from "@/lib/actions/estimates";
import { formatCurrency } from "@/lib/utils/format";
import { MA_SALES_TAX_RATE } from "@/lib/constants";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { EstimateLineItem } from "@/types";

interface EstimateLineItemsListProps {
  estimateId: string;
  lineItems: EstimateLineItem[];
  readOnly?: boolean;
}

export function EstimateLineItemsList({
  estimateId,
  lineItems,
  readOnly = false,
}: EstimateLineItemsListProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<EstimateLineItem | null>(null);

  const laborItems = lineItems.filter((li) => li.type === "labor");
  const partItems = lineItems.filter((li) => li.type === "part");
  const laborTotal = laborItems.reduce((sum, li) => sum + (li.total || 0), 0);
  const partsTotal = partItems.reduce((sum, li) => sum + (li.total || 0), 0);
  const taxAmount = partsTotal * MA_SALES_TAX_RATE;
  const grandTotal = laborTotal + partsTotal + taxAmount;

  async function handleDelete(id: string) {
    const result = await deleteEstimateLineItem(id, estimateId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Line item deleted");
    }
    return result;
  }

  function renderItems(items: EstimateLineItem[], label: string) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">{label}</h4>
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
            {!readOnly && (
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
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Line Items</CardTitle>
        {!readOnly && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {lineItems.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">
            No line items yet. Add labor or parts.
          </p>
        ) : (
          <>
            {renderItems(laborItems, "Labor")}
            {renderItems(partItems, "Parts")}
            <Separator />
            <div className="space-y-1 text-right">
              {laborItems.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Labor: {formatCurrency(laborTotal)}
                </p>
              )}
              {partItems.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Parts: {formatCurrency(partsTotal)}
                </p>
              )}
              {partItems.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Tax ({(MA_SALES_TAX_RATE * 100).toFixed(2)}% on parts):{" "}
                  {formatCurrency(taxAmount)}
                </p>
              )}
              <p className="text-lg font-bold">
                Total: {formatCurrency(grandTotal)}
              </p>
            </div>
          </>
        )}
      </CardContent>

      {!readOnly && (
        <>
          <EstimateLineItemForm
            estimateId={estimateId}
            open={addOpen}
            onOpenChange={setAddOpen}
          />

          {editItem && (
            <EstimateLineItemForm
              estimateId={estimateId}
              lineItem={editItem}
              open={!!editItem}
              onOpenChange={(open) => {
                if (!open) setEditItem(null);
              }}
            />
          )}
        </>
      )}
    </Card>
  );
}
