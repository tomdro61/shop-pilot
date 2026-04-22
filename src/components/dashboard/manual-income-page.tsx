"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import {
  createManualIncome,
  updateManualIncome,
  deleteManualIncome,
} from "@/lib/actions/manual-income";
import type { ManualIncomeEntry } from "@/lib/actions/manual-income";

interface ManualIncomePageProps {
  entries: ManualIncomeEntry[];
  existingCategories: string[];
}

export function ManualIncomePage({ entries, existingCategories }: ManualIncomePageProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form state
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [shopKeepPct, setShopKeepPct] = useState("100");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setDate(new Date().toISOString().split("T")[0]);
    setLabel("");
    setCategory("");
    setAmount("");
    setShopKeepPct("100");
    setNotes("");
    setEditId(null);
  }

  function openAdd() {
    resetForm();
    setFormOpen(true);
  }

  function openEdit(entry: ManualIncomeEntry) {
    setDate(entry.date);
    setLabel(entry.label);
    setCategory(entry.category);
    setAmount(String(entry.amount));
    setShopKeepPct(String(entry.shop_keep_pct));
    setNotes(entry.notes || "");
    setEditId(entry.id);
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !label.trim() || !category.trim() || !amount) {
      toast.error("Date, label, category, and amount are required");
      return;
    }

    setSubmitting(true);

    const input = {
      date,
      label: label.trim(),
      category: category.trim(),
      amount: parseFloat(amount),
      shop_keep_pct: parseFloat(shopKeepPct) || 100,
      notes: notes.trim() || null,
    };

    const result = editId
      ? await updateManualIncome(editId, input)
      : await createManualIncome(input);

    setSubmitting(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(editId ? "Entry updated" : "Entry added");
    setFormOpen(false);
    resetForm();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this income entry?")) return;
    const result = await deleteManualIncome(id);
    if ("error" in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success("Entry deleted");
    }
  }

  const totalAmount = entries.reduce((s, e) => s + e.amount, 0);
  const totalProfit = entries.reduce((s, e) => s + e.amount * (e.shop_keep_pct / 100), 0);

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {entries.length} entries — {formatCurrency(totalAmount)} total — {formatCurrency(totalProfit)} shop profit
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Entry
        </Button>
      </div>

      {/* Entries table */}
      <Card className="py-0 gap-0">
        <CardHeader className="bg-stone-800 dark:bg-stone-900 px-5 py-3">
          <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-stone-100">
            Manual Income Entries
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 text-left">
                  <th className="pb-2 pr-4 pt-4 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Date</th>
                  <th className="pb-2 pr-4 pt-4 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Label</th>
                  <th className="pb-2 pr-4 pt-4 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Category</th>
                  <th className="pb-2 pr-4 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Amount</th>
                  <th className="pb-2 pr-4 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Shop %</th>
                  <th className="pb-2 pr-4 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Shop Profit</th>
                  <th className="pb-2 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No manual income entries yet
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                      <td className="py-2 pr-4 tabular-nums whitespace-nowrap">
                        {new Date(entry.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="py-2 pr-4 font-medium">{entry.label}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{entry.category}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(entry.amount)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{entry.shop_keep_pct}%</td>
                      <td className="py-2 pr-4 text-right tabular-nums font-medium">
                        {formatCurrency(entry.amount * (entry.shop_keep_pct / 100))}
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(entry)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(entry.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Form */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editId ? "Edit Entry" : "Add Income Entry"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-3 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mi-date">Date</Label>
                <Input id="mi-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mi-amount">Amount ($)</Label>
                <Input id="mi-amount" type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mi-label">Label</Label>
                <Input id="mi-label" placeholder="e.g. Drive Whip Storage" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mi-category">Category</Label>
                <Input
                  id="mi-category"
                  placeholder="e.g. Contract, Parking"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  list="mi-category-list"
                />
                <datalist id="mi-category-list">
                  {existingCategories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mi-pct">Shop Keep %</Label>
                <Input id="mi-pct" type="number" step="0.01" min="0" max="100" value={shopKeepPct} onChange={(e) => setShopKeepPct(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mi-notes">Notes (optional)</Label>
                <Input id="mi-notes" placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editId ? "Update" : "Add"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
