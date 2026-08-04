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
import { ResendInvoiceButton } from "@/components/dashboard/resend-invoice-button";
import { isFirstDelivery } from "@/lib/invoices/delivery";
import { INVOICE_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { FileText, ExternalLink } from "lucide-react";
import type { Invoice, InvoiceStatus, JobStatus, PaymentStatus } from "@/types";

interface InvoiceSectionProps {
  jobId: string;
  jobStatus: JobStatus;
  invoice: Invoice | null;
  customerEmail: string | null;
  customerPhone: string | null;
  /**
   * The job's payment state, which is the only signal that sees money collected
   * outside Stripe — cash, check, Terminal and waived all update `jobs` and
   * never touch the invoice row.
   */
  paymentStatus: PaymentStatus;
  isFleet?: boolean;
  hasCardOnFile?: boolean;
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
  paymentStatus,
  isFleet = false,
  hasCardOnFile = false,
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

  // Settled outside Stripe (cash, check, Terminal, waived). `recordPayment`
  // touches only `jobs`, so there is no invoice row to reflect it — this is the
  // one signal that sees those payments. Hoisted above the !invoice branch so it
  // suppresses the Create card too, not just Resend: billing a customer who
  // already paid at the counter is the same incident either way.
  const settled = paymentStatus === "paid" || paymentStatus === "waived";

  if (!invoice) {
    if (settled) {
      return (
        <MiniStatusCard
          accent="green"
          icon={<FileText className="h-4 w-4" />}
          title={
            <>
              <span>Invoice</span>
              <span className="text-xs font-normal text-stone-500 dark:text-stone-400">
                {paymentStatus === "waived" ? "Waived" : "Paid"}
              </span>
            </>
          }
          meta="Settled without a Stripe invoice — nothing to bill."
        />
      );
    }

    if (isFleet && !hasCardOnFile) {
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

    // Fleet accounts are billed off-platform and never get a Stripe invoice, so a
    // fleet customer with a card on file is steered to charge-the-card instead.
    // Non-fleet customers keep the standard invoice option below, even with a card.
    if (isFleet && hasCardOnFile && jobStatus === "complete") {
      return (
        <MiniStatusCard
          accent="blue"
          icon={<FileText className="h-4 w-4" />}
          title={
            <>
              <span>Invoice</span>
              <span className="text-xs font-normal text-stone-500 dark:text-stone-400">
                Card on file
              </span>
            </>
          }
          meta="Use Charge Card on File below to bill and collect in one step"
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
  const accent = STATUS_ACCENT[status] ?? "stone";

  // Mirrors the server's refusals so the shop doesn't click into an error. Gated
  // on stripe_invoice_id rather than the hosted URL: createStripeInvoice persists
  // `|| ""`, and the server recovers that case from the live Stripe object, so
  // requiring a stored URL here would hide the button on exactly the rows the
  // server can still send. Contact check mirrors the SendReceiptButton gate on
  // the job page — without it the dialog opens with every control disabled.
  const canResend =
    !!invoice.stripe_invoice_id &&
    status !== "paid" &&
    !settled &&
    !isFleet &&
    (!!customerEmail || !!customerPhone);
  const neverSent = isFirstDelivery(invoice);

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
            {INVOICE_STATUS_LABELS[status] ?? status}
          </span>
          {invoice.amount != null && (
            <span className="font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50 ml-1">
              {formatCurrency(invoice.amount)}
            </span>
          )}
        </>
      }
      meta={
        invoice.paid_at ? (
          <span>Paid {formatDate(invoice.paid_at)}</span>
        ) : invoice.last_sent_at ? (
          <span>Last sent {formatDate(invoice.last_sent_at)}</span>
        ) : // Null is "unknown", not "never sent" — the column was added without a
        // backfill and plenty of older invoices really were delivered. Render
        // nothing rather than implying they weren't.
        null
      }
      // flex-wrap because MiniStatusCard's action slot is flex-none: it can't
      // shrink, so a second button here steals width from the title instead of
      // wrapping. At 360px two full-width buttons leave the title ~47px, which
      // pushes the currency token outside the card.
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Kept visible in every state — it's the only in-app route to the
              invoice in Stripe, which is the audit trail. */}
          {invoice.stripe_hosted_invoice_url ? (
            <a
              href={invoice.stripe_hosted_invoice_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="h-3.5 w-3.5 sm:mr-1.5" />
                <span className="sr-only sm:not-sr-only">View</span>
              </Button>
            </a>
          ) : null}
          {canResend ? (
            <ResendInvoiceButton
              jobId={jobId}
              customerEmail={customerEmail}
              customerPhone={customerPhone}
              lastSentAt={invoice.last_sent_at}
              neverSent={neverSent}
            />
          ) : null}
        </div>
      }
    />
  );
}
