"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { getStripeClient } from "@/lib/stripe/client";
import {
  createSetupIntent,
  setDefaultPaymentMethod,
  removePaymentMethod,
} from "@/lib/actions/payment-methods";

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

function SetupIntentForm({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createSetupIntent(customerId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setClientSecret(result.data.clientSecret);
      } else {
        setError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (error) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <Button variant="outline" size="sm" onClick={onClose} className="mt-4">
          Close
        </Button>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <Elements stripe={getStripeClient()} options={{ clientSecret }}>
      <CardForm customerId={customerId} onClose={onClose} />
    </Elements>
  );
}

function CardForm({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    });

    if (confirmError) {
      toast.error(confirmError.message || "Failed to save card");
      setSubmitting(false);
      return;
    }

    if (!setupIntent || !setupIntent.payment_method) {
      toast.error("Stripe did not return a payment method");
      setSubmitting(false);
      return;
    }

    const pmId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method.id;

    const result = await setDefaultPaymentMethod(customerId, pmId);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("Card saved on file");
    onClose();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <PaymentElement options={{ layout: "tabs" }} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || !elements || submitting}>
          {submitting ? "Saving..." : "Save Card"}
        </Button>
      </DialogFooter>
    </form>
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
