"use client";

import { useState } from "react";
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
import { sendEstimate } from "@/lib/actions/estimates";
import { Send, Copy, Check } from "lucide-react";
import type { EstimateStatus } from "@/types";

interface EstimateActionsProps {
  estimateId: string;
  status: EstimateStatus;
  approvalToken: string | null;
}

export function EstimateActions({
  estimateId,
  status,
  approvalToken,
}: EstimateActionsProps) {
  const [loading, setLoading] = useState(false);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSend() {
    setLoading(true);
    const result = await sendEstimate(estimateId);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.data?.approvalUrl) {
      setApprovalUrl(result.data.approvalUrl);
      toast.success("Estimate sent! Copy the approval link to share.");
    }
  }

  async function handleCopyLink() {
    const url =
      approvalUrl ||
      (approvalToken
        ? `${window.location.origin}/estimates/approve/${approvalToken}`
        : null);

    if (!url) return;

    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Approval link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  if (status === "draft") {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={loading}>
            <Send className="mr-2 h-4 w-4" />
            {loading ? "Sending..." : "Send Estimate"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Estimate</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the estimate as sent and generate an approval link.
              You can then share the link with the customer via text or email.
              The estimate cannot be edited after sending.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend} disabled={loading}>
              {loading ? "Sending..." : "Send"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (status === "sent") {
    return (
      <Button variant="outline" onClick={handleCopyLink}>
        {copied ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Copy className="mr-2 h-4 w-4" />
        )}
        {copied ? "Copied!" : "Copy Approval Link"}
      </Button>
    );
  }

  return null;
}
