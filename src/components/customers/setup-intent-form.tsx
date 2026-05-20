"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { getStripeClient } from "@/lib/stripe/client";
import {
  createSetupIntent,
  setDefaultPaymentMethod,
} from "@/lib/actions/payment-methods";

export default function SetupIntentForm({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createSetupIntent(customerId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setClientSecret(result.data.clientSecret);
        } else {
          setError(result.error);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to initialize payment");
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
