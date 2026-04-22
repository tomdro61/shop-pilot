"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { createInvoiceFromJob } from "@/lib/actions/invoices";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { FileText, ExternalLink } from "lucide-react";
import type { Invoice, InvoiceStatus, JobStatus } from "@/types";

interface InvoiceSectionProps {
  jobId: string;
  jobStatus: JobStatus;
  invoice: Invoice | null;
  customerEmail: string | null;
  customerPhone: string | null;
  isFleet?: boolean;
}

const SECTION_LABEL = "text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400";

export function InvoiceSection({
  jobId,
  jobStatus,
  invoice,
  customerEmail,
  customerPhone,
  isFleet = false,
}: InvoiceSectionProps) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [sendText, setSendText] = useState(!!customerPhone);
  const [sendEmail, setSendEmail] = useState(!!customerEmail);

  async function handleCreateInvoice() {
    setLoading(true);
    const result = await createInvoiceFromJob(jobId, { sendText, sendEmail });
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setOpen(false);
    const channels = [sendText && "text", sendEmail && "email"].filter(Boolean);
    if (channels.length > 0) {
      toast.success(`Invoice created and sent via ${channels.join(" & ")}`);
    } else {
      toast.success("Invoice created (not sent to customer)");
    }
  }

  // Don't show if job isn't complete and no invoice exists
  if (jobStatus !== "complete" && !invoice) {
    return null;
  }

  const status = invoice?.status as InvoiceStatus | undefined;
  const statusColors = status ? INVOICE_STATUS_COLORS[status] : null;

  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-stone-50 dark:bg-stone-900/40 border-b border-stone-200 dark:border-stone-800">
        <h3 className={`flex items-center gap-1.5 ${SECTION_LABEL}`}>
          <FileText className="h-3 w-3" />
          Invoice
        </h3>
        {status && statusColors && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${statusColors.bg} ${statusColors.text}`}>
            {INVOICE_STATUS_LABELS[status]}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {!invoice ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            {isFleet ? (
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Fleet account — billed separately (no Stripe invoice).
              </p>
            ) : (
              <>
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  Job is complete. Ready to invoice.
                </p>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" disabled={loading}>
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Create Invoice
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create & Send Invoice</DialogTitle>
                      <DialogDescription>
                        This will create a Stripe invoice with a payment link.
                        Choose how to deliver it to the customer.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="send-text"
                          checked={sendText}
                          onCheckedChange={(checked) => setSendText(checked === true)}
                          disabled={!customerPhone}
                        />
                        <div className="grid gap-0.5 leading-none">
                          <Label htmlFor="send-text" className={!customerPhone ? "text-stone-500" : ""}>
                            Send via Text
                          </Label>
                          <p className="text-xs text-stone-500 dark:text-stone-400">
                            {customerPhone || "No phone number on file"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="send-email"
                          checked={sendEmail}
                          onCheckedChange={(checked) => setSendEmail(checked === true)}
                          disabled={!customerEmail}
                        />
                        <div className="grid gap-0.5 leading-none">
                          <Label htmlFor="send-email" className={!customerEmail ? "text-stone-500" : ""}>
                            Send via Email
                          </Label>
                          <p className="text-xs text-stone-500 dark:text-stone-400">
                            {customerEmail || "No email address on file"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleCreateInvoice}
                        disabled={loading}
                      >
                        {loading ? "Creating..." : "Create & Send"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              {invoice.amount != null && (
                <>
                  <dt className="text-stone-500 dark:text-stone-400">Amount</dt>
                  <dd className="font-mono tabular-nums text-stone-900 dark:text-stone-50 font-medium">
                    {formatCurrency(invoice.amount)}
                  </dd>
                </>
              )}
              {invoice.paid_at && (
                <>
                  <dt className="text-stone-500 dark:text-stone-400">Paid</dt>
                  <dd className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                    {formatDate(invoice.paid_at)}
                  </dd>
                </>
              )}
            </dl>
            {invoice.stripe_hosted_invoice_url && (
              <a
                href={invoice.stripe_hosted_invoice_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button variant="outline" size="sm" className="w-full">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  View Invoice
                </Button>
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
