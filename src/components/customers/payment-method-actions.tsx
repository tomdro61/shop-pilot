"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { removePaymentMethod } from "@/lib/actions/payment-methods";

// Lazy-load Stripe Elements + getStripeClient so the customer detail page bundle
// doesn't ship the Stripe.js library until the Add/Replace Card dialog opens.
const SetupIntentForm = dynamic(
  () => import("./setup-intent-form"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
      </div>
    ),
  }
);

interface AddCardButtonProps {
  customerId: string;
  hasExistingCard: boolean;
}

export function AddCardButton({ customerId, hasExistingCard }: AddCardButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {!hasExistingCard && <Plus className="mr-1.5 h-3.5 w-3.5" />}
        {hasExistingCard ? "Replace Card" : "Add Card"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save card on file</DialogTitle>
            <DialogDescription>
              The card is stored securely with Stripe. ShopPilot only keeps a reference,
              never the card number.
            </DialogDescription>
          </DialogHeader>

          {open && <SetupIntentForm customerId={customerId} onClose={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RemoveCardButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    const result = await removePaymentMethod(customerId);
    setRemoving(false);

    if (!result.ok) {
      toast.error(result.error);
      setOpen(false);
      return;
    }

    toast.success("Card removed");
    setOpen(false);
    router.refresh();
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-stone-500 hover:text-red-600 dark:text-stone-400 dark:hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove card on file?</AlertDialogTitle>
          <AlertDialogDescription>
            This detaches the saved card from this customer in Stripe. You won&apos;t be
            able to charge it until a new card is saved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleRemove();
            }}
            disabled={removing}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {removing ? "Removing..." : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
