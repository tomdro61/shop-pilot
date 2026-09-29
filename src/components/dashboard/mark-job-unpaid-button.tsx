"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { markJobUnpaid } from "@/lib/actions/jobs";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { PaymentMethod } from "@/types";

export function MarkJobUnpaidButton({
  jobId,
  paymentMethod,
}: {
  jobId: string;
  paymentMethod: PaymentMethod | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleMarkUnpaid() {
    if (loading) return;
    setLoading(true);
    try {
      const result = await markJobUnpaid(jobId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Marked as unpaid");
      router.refresh();
    } catch {
      toast.error("Couldn't mark the job as unpaid — nothing was changed. Try again.");
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !loading && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          disabled={loading}
          className="bg-transparent border border-stone-700 text-stone-200 hover:bg-stone-800 hover:text-white shadow-none"
        >
          <Undo2 className="mr-1.5 h-3.5 w-3.5" />
          Mark as Unpaid
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark this job as unpaid?</AlertDialogTitle>
          <AlertDialogDescription>
            This clears the recorded payment
            {paymentMethod ? ` (${PAYMENT_METHOD_LABELS[paymentMethod]})` : ""} and
            puts the balance back on the job. It doesn&apos;t refund anything. If a
            receipt was already sent, the customer keeps it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Keep as paid</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleMarkUnpaid();
            }}
            disabled={loading}
          >
            {loading ? "Updating..." : "Mark as unpaid"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
