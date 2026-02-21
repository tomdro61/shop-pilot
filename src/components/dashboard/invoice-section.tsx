"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createInvoiceFromJob } from "@/lib/actions/invoices";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils/format";
import { FileText, ExternalLink } from "lucide-react";
import type { Invoice, InvoiceStatus, JobStatus } from "@/types";

interface InvoiceSectionProps {
  jobId: string;
  jobStatus: JobStatus;
  invoice: Invoice | null;
  customerEmail: string | null;
}

export function InvoiceSection({
  jobId,
  jobStatus,
  invoice,
  customerEmail,
}: InvoiceSectionProps) {
  const [loading, setLoading] = useState(false);

  async function handleCreateInvoice() {
    setLoading(true);
    const result = await createInvoiceFromJob(jobId);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Invoice created and sent to customer");
  }

  // Don't show if job isn't complete and no invoice exists
  if (jobStatus !== "complete" && jobStatus !== "paid" && !invoice) {
    return null;
  }

  const status = invoice?.status as InvoiceStatus | undefined;
  const statusColors = status ? INVOICE_STATUS_COLORS[status] : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          Invoice
        </CardTitle>
        {status && statusColors && (
          <Badge
            variant="outline"
            className={`${statusColors.bg} ${statusColors.text} ${statusColors.border}`}
          >
            {INVOICE_STATUS_LABELS[status]}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {!invoice ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              Job is complete. Ready to invoice.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={loading}>
                  <FileText className="mr-2 h-4 w-4" />
                  Create Invoice
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Create & Send Invoice</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create a Stripe invoice and send it to{" "}
                    <strong>{customerEmail || "the customer"}</strong>. They will
                    receive an email with a link to pay.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCreateInvoice}
                    disabled={loading}
                  >
                    {loading ? "Creating..." : "Create & Send"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
                <span>{new Date(invoice.paid_at).toLocaleDateString()}</span>
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
