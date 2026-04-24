"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MiniStatusCard, ACCENT_PILL, type Accent } from "@/components/ui/mini-status-card";
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
import { INVOICE_STATUS_LABELS } from "@/lib/constants";
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

const STATUS_ACCENT: Record<InvoiceStatus, Accent> = {
  draft: "blue",
  sent: "amber",
  paid: "green",
};

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

  if (jobStatus !== "complete" && !invoice) {
    return null;
  }

  if (!invoice) {
    if (isFleet) {
      return (
        <MiniStatusCard
          accent="stone"
          icon={<FileText className="h-4 w-4" />}
          title={
            <>
              <span>Invoice</span>
              <span className="text-xs font-normal text-stone-500 dark:text-stone-400">
                Fleet account
              </span>
            </>
          }
          meta="Billed separately — no Stripe invoice"
        />
      );
    }

    return (
      <MiniStatusCard
        accent="stone"
        icon={<FileText className="h-4 w-4" />}
        title={
          <>
            <span>Invoice</span>
            <span className="text-xs font-normal text-stone-500 dark:text-stone-400">
              Ready to invoice
            </span>
          </>
        }
        meta="Job is complete. Generate a Stripe invoice."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={loading}>
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Create
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create & Send Invoice</DialogTitle>
                <DialogDescription>
                  This will create a Stripe invoice with a payment link. Choose how to deliver it to the customer.
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
                <Button onClick={handleCreateInvoice} disabled={loading}>
                  {loading ? "Creating..." : "Create & Send"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
    );
  }

  const status = invoice.status as InvoiceStatus;
  const accent = STATUS_ACCENT[status];

  return (
    <MiniStatusCard
      accent={accent}
      icon={<FileText className="h-4 w-4" />}
      title={
        <>
          <span>Invoice</span>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${ACCENT_PILL[accent]}`}
          >
            {INVOICE_STATUS_LABELS[status]}
          </span>
          {invoice.amount != null && (
            <span className="font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50 ml-1">
              {formatCurrency(invoice.amount)}
            </span>
          )}
        </>
      }
      meta={
        invoice.paid_at ? <span>Paid {formatDate(invoice.paid_at)}</span> : null
      }
      actions={
        invoice.stripe_hosted_invoice_url ? (
          <a
            href={invoice.stripe_hosted_invoice_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              View
            </Button>
          </a>
        ) : null
      }
    />
  );
}
