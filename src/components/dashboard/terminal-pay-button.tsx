"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle, Smartphone } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

interface TerminalPayButtonProps {
  jobId: string;
  amountCents: number;
}

type TerminalState = "idle" | "processing" | "succeeded" | "failed" | "canceled";

export function TerminalPayButton({ jobId, amountCents }: TerminalPayButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<TerminalState>("idle");
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const pollStatus = useCallback(async (piId: string) => {
    try {
      const res = await fetch(`/api/terminal/status?pi=${piId}`);
      const data = await res.json();

      if (data.status === "succeeded") {
        setState("succeeded");
        toast.success("Payment collected via Terminal");
        setTimeout(() => {
          setDialogOpen(false);
          router.refresh();
        }, 1500);
        return;
      }

      if (data.status === "canceled") {
        setState("canceled");
        return;
      }

      // Still processing — poll again
      if (state === "processing") {
        setTimeout(() => pollStatus(piId), 2000);
      }
    } catch {
      // Network error — retry
      if (state === "processing") {
        setTimeout(() => pollStatus(piId), 3000);
      }
    }
  }, [state, router]);

  useEffect(() => {
    if (state === "processing" && paymentIntentId) {
      const timeout = setTimeout(() => pollStatus(paymentIntentId), 2000);
      return () => clearTimeout(timeout);
    }
  }, [state, paymentIntentId, pollStatus]);

  async function handleCollect() {
    setState("processing");
    setDialogOpen(true);

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

      setPaymentIntentId(data.paymentIntentId);
      // Polling starts via useEffect
    } catch {
      setState("failed");
      toast.error("Failed to connect to terminal");
    }
  }

  async function handleCancel() {
    try {
      await fetch("/api/terminal/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId }),
      });
      setState("canceled");
      toast("Payment canceled");
      setTimeout(() => {
        setDialogOpen(false);
        setState("idle");
        setPaymentIntentId(null);
      }, 1000);
    } catch {
      toast.error("Failed to cancel");
    }
  }

  function handleDialogClose(open: boolean) {
    if (!open && state !== "processing") {
      setDialogOpen(false);
      setState("idle");
      setPaymentIntentId(null);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleCollect} disabled={state === "processing"}>
        <Smartphone className="mr-1.5 h-3.5 w-3.5" />
        Collect at Counter
      </Button>

      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-sm">
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
                  Waiting for customer to present card...
                </p>
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
              </>
            )}

            {state === "succeeded" && (
              <>
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                <p className="text-sm font-medium text-emerald-600">Payment Complete</p>
              </>
            )}

            {state === "failed" && (
              <>
                <XCircle className="h-10 w-10 text-red-500" />
                <p className="text-sm text-red-600">Payment failed. Try again.</p>
                <Button variant="outline" size="sm" onClick={() => { setDialogOpen(false); setState("idle"); }}>
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
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
