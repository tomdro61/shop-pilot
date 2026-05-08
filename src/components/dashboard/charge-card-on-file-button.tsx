"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { brandLabel } from "@/lib/utils/card-brand";
import { chargeCardOnFile } from "@/lib/actions/charge-card-on-file";
import type { SavedCard } from "@/lib/actions/payment-methods";

interface ChargeCardOnFileButtonProps {
  jobId: string;
  amountCents: number;
  customerName: string;
  card: SavedCard;
}

export function ChargeCardOnFileButton({
  jobId,
  amountCents,
  customerName,
  card,
}: ChargeCardOnFileButtonProps) {
  const router = useRouter();
  const [charging, setCharging] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleCharge() {
    if (charging) return;
    setCharging(true);
    const result = await chargeCardOnFile(jobId);
    setCharging(false);

    if (!result.ok) {
      toast.error(result.error);
      // Close on failure too — toast carries the message; leaving the
      // confirm dialog open after a decline is more confusing than helpful.
      setOpen(false);
      return;
    }

    toast.success(`Charged ${formatCurrency(result.data.amountDollars)} to ${brandLabel(card.brand)} ••${card.last4}`);
    setOpen(false);
    router.refresh();
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          className="bg-blue-600 text-white hover:bg-blue-700"
          disabled={charging}
        >
          <CreditCard className="mr-1.5 h-3.5 w-3.5" />
          Charge Card on File
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Charge card on file?</AlertDialogTitle>
          <AlertDialogDescription>
            Charge {formatCurrency(amountCents / 100)} to {customerName}&apos;s{" "}
            {brandLabel(card.brand)} ending in {card.last4}. A receipt will be emailed
            automatically once the charge succeeds.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={charging}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleCharge();
            }}
            disabled={charging}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {charging ? "Charging..." : `Charge ${formatCurrency(amountCents / 100)}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
