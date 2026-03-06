"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
          <FileText className="h-3.5 w-3.5" />
          Invoice
        </CardTitle>
        {status && statusColors && (
          <Badge
            variant="outline"
            className={`${statusColors.bg} ${statusColors.text}`}
          >
            {INVOICE_STATUS_LABELS[status]}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {!invoice ? (
          <div className="flex flex-col items-center gap-3 py-2">
            {isFleet ? (
              <p className="text-sm text-muted-foreground">
                Fleet account — billed separately (no Stripe invoice).
              </p>
            ) : (
            <>
            <p className="text-sm text-muted-foreground">
              Job is complete. Ready to invoice.
            </p>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={loading}>
                  <FileText className="mr-2 h-4 w-4" />
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
                      <Label htmlFor="send-text" className={!customerPhone ? "text-muted-foreground" : ""}>
                        Send via Text
                      </Label>
                      <p className="text-xs text-muted-foreground">
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
                      <Label htmlFor="send-email" className={!customerEmail ? "text-muted-foreground" : ""}>
                        Send via Email
                      </Label>
                      <p className="text-xs text-muted-foreground">
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
          <div className="space-y-2">
            {invoice.amount != null && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">
                  {formatCurrency(invoice.amount)}
                </span>
              </div>
            )}
            {invoice.paid_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span>{formatDate(invoice.paid_at)}</span>
              </div>
            )}
            {invoice.stripe_hosted_invoice_url && (
              <a
                href={invoice.stripe_hosted_invoice_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="mt-2 w-full">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Invoice
                </Button>
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
