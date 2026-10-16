"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle, Smartphone, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

interface TerminalPayButtonProps {
  jobId: string;
  amountCents: number;
}

type TerminalState =
  | "idle"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled"
  | "unconfirmed"
  | "unrecorded"
  | "double";

const MAX_POLL_FAILURES = 5;

export function TerminalPayButton({ jobId, amountCents }: TerminalPayButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<TerminalState>("idle");
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const cancelingRef = useRef(false);
  // Set when Cancel is pressed before /api/terminal/pay has returned an id,
  // so the charge that lands on the reader a moment later is cancelled with
  // its real id instead of being left live behind a "canceled" message.
  const cancelRequestedRef = useRef(false);
  const pollFailuresRef = useRef(0);
  const stateRef = useRef<TerminalState>("idle");
  stateRef.current = state;

  function succeed() {
    setState("succeeded");
    toast.success("Payment collected via Terminal");
    setTimeout(() => {
      setDialogOpen(false);
      router.refresh();
    }, 1500);
  }

  const pollStatus = useCallback(async (piId: string) => {
    if (stateRef.current !== "processing" || cancelingRef.current) return;
    try {
      const res = await fetch(`/api/terminal/status?pi=${piId}`);
      if (!res.ok) {
        // A session that expired or a server error: the card may still be
        // charged, so stop asking and say so instead of spinning forever.
        pollFailuresRef.current += 1;
        if (pollFailuresRef.current >= MAX_POLL_FAILURES) {
          setState("unconfirmed");
          toast.error("Couldn't confirm — check the reader before charging again");
          return;
        }
        setTimeout(() => pollStatus(piId), 3000);
        return;
      }
      pollFailuresRef.current = 0;
      const data = await res.json();

      if (data.status === "succeeded") {
        // The charge went through. Whether it reached the job is a separate
        // fact the route reports; a green screen on a failed record invites
        // a second charge.
        if (data.recorded === "error" || data.recorded === "missing-job") {
          setState("unrecorded");
          toast.error("Card charged, but the payment is not on the job yet — do not charge again");
          return;
        }
        if (data.recorded === "double-collection") {
          setState("double");
          toast.error("This job was already paid — the card was charged a second time");
          return;
        }
        succeed();
        return;
      }

      if (data.status === "canceled") {
        setState("canceled");
        return;
      }

      setTimeout(() => pollStatus(piId), 2000);
    } catch {
      setTimeout(() => pollStatus(piId), 3000);
    }
    // succeed() reads only stable setters and the router captured below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (state === "processing" && paymentIntentId) {
      const timeout = setTimeout(() => pollStatus(paymentIntentId), 2000);
      return () => clearTimeout(timeout);
    }
  }, [state, paymentIntentId, pollStatus]);

  async function cancelOnReader(piId: string | null): Promise<Response> {
    return fetch("/api/terminal/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentIntentId: piId }),
    });
  }

  async function handleCollect() {
    setState("processing");
    setDialogOpen(true);
    setPaymentIntentId(null);
    cancelingRef.current = false;
    cancelRequestedRef.current = false;
    pollFailuresRef.current = 0;

    try {
      const res = await fetch("/api/terminal/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, amountCents }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState("failed");
        toast.error(data.error || "Failed to start terminal payment");
        return;
      }

      if (cancelRequestedRef.current) {
        try {
          await cancelOnReader(data.paymentIntentId);
        } catch {
          // Falls through to the reader state below.
        }
        setPaymentIntentId(data.paymentIntentId);
        setState("unconfirmed");
        toast.error("Cancel was pressed while the reader was starting — check the reader before charging again");
        return;
      }

      setPaymentIntentId(data.paymentIntentId);
    } catch {
      setState("failed");
      toast.error("Failed to connect to terminal");
    }
  }

  // A cancel that fails usually means the customer tapped first. Asking Stripe
  // which it was is the only safe answer; "canceled" on a charge that went
  // through invites a second Collect.
  async function reconcileAfterFailedCancel(): Promise<"succeeded" | "canceled" | "unknown"> {
    if (!paymentIntentId) return "unknown";
    try {
      const res = await fetch(`/api/terminal/status?pi=${paymentIntentId}`);
      if (!res.ok) return "unknown";
      const data = await res.json();
      if (data.status === "succeeded") return "succeeded";
      if (data.status === "canceled") return "canceled";
      return "unknown";
    } catch {
      return "unknown";
    }
  }

  async function handleCancel() {
    if (cancelingRef.current) return;
    if (!paymentIntentId) {
      // The reader hasn't been armed yet; handleCollect cancels with the real
      // id as soon as it has one.
      cancelRequestedRef.current = true;
      return;
    }
    cancelingRef.current = true;
    try {
      const res = await cancelOnReader(paymentIntentId);
      if (!res.ok) {
        const outcome = await reconcileAfterFailedCancel();
        if (outcome === "succeeded") {
          succeed();
        } else if (outcome === "canceled") {
          showCanceled();
        } else {
          setState("unconfirmed");
          toast.error("Couldn't confirm — check the reader before charging again");
        }
        return;
      }
      showCanceled();
    } catch {
      const outcome = await reconcileAfterFailedCancel();
      if (outcome === "succeeded") {
        succeed();
      } else if (outcome === "canceled") {
        showCanceled();
      } else {
        setState("unconfirmed");
        toast.error("Couldn't confirm — check the reader before charging again");
      }
    } finally {
      cancelingRef.current = false;
    }
  }

  function showCanceled() {
    setState("canceled");
    toast("Payment canceled");
    setTimeout(() => {
      setDialogOpen(false);
      setState("idle");
      setPaymentIntentId(null);
    }, 1000);
  }

  function closeAndReset() {
    setDialogOpen(false);
    setState("idle");
    setPaymentIntentId(null);
    router.refresh();
  }

  const mustAcknowledge = state === "unconfirmed" || state === "unrecorded" || state === "double";

  function handleDialogClose(open: boolean) {
    if (!open && state !== "processing" && !mustAcknowledge) {
      closeAndReset();
    }
  }

  return (
    <>
      <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={handleCollect} disabled={state === "processing"}>
        <Smartphone className="mr-1.5 h-3.5 w-3.5" />
        Collect at Counter
      </Button>

      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent
          className="sm:max-w-sm"
          showCloseButton={state !== "processing" && !mustAcknowledge}
        >
          <DialogHeader>
            <DialogTitle>Terminal Payment</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-6">
            <p className="text-3xl font-bold tabular-nums">
              {formatCurrency(amountCents / 100)}
            </p>

            {state === "processing" && (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {paymentIntentId ? "Waiting for customer to present card..." : "Connecting to reader..."}
                </p>
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
              </>
            )}

            {state === "succeeded" && (
              <>
                <CheckCircle2 className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Payment Complete</p>
              </>
            )}

            {state === "failed" && (
              <>
                <XCircle className="h-10 w-10 text-red-500 dark:text-red-400" />
                <p className="text-sm text-red-600 dark:text-red-400">Payment failed. Try again.</p>
                <Button variant="outline" size="sm" onClick={closeAndReset}>
                  Close
                </Button>
              </>
            )}

            {state === "canceled" && (
              <>
                <XCircle className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Payment canceled</p>
              </>
            )}

            {state === "unrecorded" && (
              <>
                <AlertTriangle className="h-10 w-10 text-amber-500 dark:text-amber-400" />
                <p className="text-center text-sm text-amber-700 dark:text-amber-300">
                  The card was charged, but the payment is not recorded on this job yet. It will be
                  recorded automatically from Stripe. Do not charge again.
                </p>
                <Button variant="outline" size="sm" onClick={closeAndReset}>
                  Understood
                </Button>
              </>
            )}

            {state === "double" && (
              <>
                <XCircle className="h-10 w-10 text-red-500 dark:text-red-400" />
                <p className="text-center text-sm text-red-700 dark:text-red-300">
                  This job was already marked paid. The card was charged a second time — refund it
                  in Stripe.
                </p>
                <Button variant="outline" size="sm" onClick={closeAndReset}>
                  Understood
                </Button>
              </>
            )}

            {state === "unconfirmed" && (
              <>
                <AlertTriangle className="h-10 w-10 text-amber-500 dark:text-amber-400" />
                <p className="text-center text-sm text-amber-700 dark:text-amber-300">
                  Couldn&apos;t confirm whether the card was charged. Check the reader and Stripe before charging again.
                </p>
                <Button variant="outline" size="sm" onClick={closeAndReset}>
                  I&apos;ve checked
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
