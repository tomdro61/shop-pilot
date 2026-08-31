"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/dashboard/delete-confirm-dialog";
import { voidInvoiceForJob } from "@/lib/actions/invoices";

interface VoidInvoiceButtonProps {
  jobId: string;
}

export function VoidInvoiceButton({ jobId }: VoidInvoiceButtonProps) {
  const router = useRouter();

  async function handleVoid() {
    // The dialog discards this return value, so the outcome has to reach the
    // user as a toast.
    try {
      const result = await voidInvoiceForJob(jobId);

      if (!result.ok) {
        toast.error(result.error);
        return { error: result.error };
      }

      toast.success("Invoice voided — you can create a new one for this job.");
      router.refresh();
      return { success: true };
    } catch (err) {
      // A thrown action (network drop, deploy mid-request) is ambiguous: the
      // void may well have landed in Stripe. Don't claim either outcome, and
      // make sure the ambiguity itself is visible.
      Sentry.captureException(err, {
        tags: { source: "void-invoice", path: "client-invoke" },
        extra: { jobId },
      });
      const message =
        "Couldn't tell whether the void went through. Refresh the job before retrying.";
      toast.error(message);
      return { error: message };
    }
  }

  return (
    <DeleteConfirmDialog
      title="Void this invoice?"
      description="Voids it in Stripe so the customer can't pay it, and clears it from this job so you can create a corrected one. The voided invoice stays in Stripe for your records. This can't be undone."
      confirmLabel="Void"
      confirmingLabel="Voiding..."
      onConfirm={handleVoid}
      trigger={
        <Button variant="outline" size="sm">
          <Ban className="h-3.5 w-3.5 sm:mr-1.5" />
          <span className="sr-only sm:not-sr-only">Void</span>
        </Button>
      }
    />
  );
}
