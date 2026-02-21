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
import { approveEstimate, declineEstimate } from "@/lib/actions/estimates";
import { Check, X } from "lucide-react";

interface EstimateApprovalButtonsProps {
  token: string;
}

export function EstimateApprovalButtons({
  token,
}: EstimateApprovalButtonsProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleApprove() {
    setLoading(true);
    const result = await approveEstimate(token);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Estimate approved! An invoice has been sent to your email.");
    router.refresh();
  }

  async function handleDecline() {
    setLoading(true);
    const result = await declineEstimate(token);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Estimate declined.");
    router.refresh();
  }

  return (
    <div className="flex gap-3">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button className="flex-1" size="lg" disabled={loading}>
            <Check className="mr-2 h-5 w-5" />
            Approve Estimate
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Estimate</AlertDialogTitle>
            <AlertDialogDescription>
              By approving, you authorize this repair work. An invoice will be
              sent to your email for payment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={loading}>
              {loading ? "Processing..." : "Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="flex-1" size="lg" disabled={loading}>
            <X className="mr-2 h-5 w-5" />
            Decline
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline Estimate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to decline this estimate? You can contact the
              shop to discuss alternatives.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDecline}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? "Processing..." : "Decline"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
