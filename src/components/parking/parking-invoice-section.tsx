"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createParkingInvoice } from "@/lib/actions/invoices";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { SECTION_LABEL } from "@/components/ui/section-card";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import type { Invoice, InvoiceStatus } from "@/types";

interface ParkingInvoiceSectionProps {
  reservationId: string;
  invoices: Invoice[];
  customerPhone: string | null;
  customerEmail: string | null;
}

interface LineItemRow {
  description: string;
  amount: string;
}

export function ParkingInvoiceSection({
  reservationId,
  invoices,
  customerPhone,
  customerEmail,
}: ParkingInvoiceSectionProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([
    { description: "", amount: "" },
  ]);
  const [sendText, setSendText] = useState(!!customerPhone);
  const [sendEmail, setSendEmail] = useState(!!customerEmail);

  function addRow() {
    setLineItems((prev) => [...prev, { description: "", amount: "" }]);
  }

  function removeRow(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: keyof LineItemRow, value: string) {
    setLineItems((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  const total = lineItems.reduce((sum, row) => {
    const val = parseFloat(row.amount);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const hasValidItems = lineItems.some(
    (row) => row.description.trim() && parseFloat(row.amount) > 0
  );

  async function handleCreate() {
    const validItems = lineItems
      .filter((row) => row.description.trim() && parseFloat(row.amount) > 0)
      .map((row) => ({
        description: row.description.trim(),
        amount: parseFloat(row.amount),
      }));

    if (validItems.length === 0) {
      toast.error("Add at least one line item");
      return;
    }

    setLoading(true);
    const result = await createParkingInvoice(reservationId, validItems, {
      sendText,
      sendEmail,
    });
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setOpen(false);
    setLineItems([{ description: "", amount: "" }]);

    const channels = [sendText && "text", sendEmail && "email"].filter(Boolean);
    if (channels.length > 0) {
      toast.success(`Invoice created and sent via ${channels.join(" & ")}`);
    } else {
      toast.success("Invoice created (not sent to customer)");
    }
  }

  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-100 dark:border-stone-800/60">
        <h3 className={SECTION_LABEL}>Invoices</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {invoices.length > 0 ? "Send Another" : "Send Invoice"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Parking Invoice</DialogTitle>
              <DialogDescription>
                Add line items and send a Stripe payment link.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {lineItems.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Description"
                    value={row.description}
                    onChange={(e) => updateRow(i, "description", e.target.value)}
                    className="flex-1"
                  />
                  <div className="relative w-24">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-stone-500 dark:text-stone-400">
                      $
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={row.amount}
                      onChange={(e) => updateRow(i, "amount", e.target.value)}
                      className="pl-6 font-mono tabular-nums"
                    />
                  </div>
                  {lineItems.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-stone-400 hover:text-red-500"
                      onClick={() => removeRow(i)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={addRow}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Line Item
              </Button>
              {total > 0 && (
                <div className="flex justify-between border-t border-stone-100 dark:border-stone-800/60 pt-2 text-sm">
                  <span className={SECTION_LABEL}>Total</span>
                  <span className="font-mono tabular-nums font-semibold text-stone-900 dark:text-stone-50">
                    {formatCurrency(total)}
                  </span>
                </div>
              )}
              <div className="space-y-3 border-t border-stone-100 dark:border-stone-800/60 pt-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="parking-send-text"
                    checked={sendText}
                    onCheckedChange={(checked) =>
                      setSendText(checked === true)
                    }
                    disabled={!customerPhone}
                  />
                  <div className="grid gap-0.5 leading-none">
                    <Label
                      htmlFor="parking-send-text"
                      className={!customerPhone ? "text-stone-400 dark:text-stone-500" : ""}
                    >
                      Send via Text
                    </Label>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {customerPhone || "No phone number on file"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="parking-send-email"
                    checked={sendEmail}
                    onCheckedChange={(checked) =>
                      setSendEmail(checked === true)
                    }
                    disabled={!customerEmail}
                  />
                  <div className="grid gap-0.5 leading-none">
                    <Label
                      htmlFor="parking-send-email"
                      className={!customerEmail ? "text-stone-400 dark:text-stone-500" : ""}
                    >
                      Send via Email
                    </Label>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {customerEmail || "No email address on file"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={loading || !hasValidItems}
              >
                {loading ? "Creating…" : "Create & Send"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="px-4 py-3">
        {invoices.length === 0 ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">No invoices yet.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => {
              const status = inv.status as InvoiceStatus;
              const colors = INVOICE_STATUS_COLORS[status];
              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-md border border-stone-200 dark:border-stone-800 px-3 py-2"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono tabular-nums text-sm font-semibold text-stone-900 dark:text-stone-50">
                        {formatCurrency(inv.amount ?? 0)}
                      </span>
                      {colors && (
                        <Badge
                          variant="secondary"
                          className={`${colors.bg} ${colors.text} border-0 text-[10px] px-1.5 py-0`}
                        >
                          {INVOICE_STATUS_LABELS[status]}
                        </Badge>
                      )}
                    </div>
                    {inv.paid_at ? (
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        Paid {formatDate(inv.paid_at)}
                      </p>
                    ) : (
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {new Date(inv.created_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {inv.stripe_hosted_invoice_url && (
                    <a
                      href={inv.stripe_hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" size="icon-xs">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
