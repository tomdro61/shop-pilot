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
import {
  sendEstimate,
  resendEstimate,
  deleteEstimate,
  markEstimateApproved,
  markEstimateDeclined,
  convertEstimateToJob,
} from "@/lib/actions/estimates";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import {
  ArrowRight,
  Check,
  Copy,
  HandCoins,
  RotateCw,
  Send,
  ThumbsDown,
  Trash2,
  Workflow,
} from "lucide-react";
import type { EstimateStatus } from "@/types";

interface EstimateActionsProps {
  estimateId: string;
  status: EstimateStatus;
  approvalToken: string | null;
  jobId: string | null;
  customerId: string | null;
}

export function EstimateActions({
  estimateId,
  status,
  approvalToken,
  jobId,
  customerId,
}: EstimateActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSend() {
    if (loading) return;
    setLoading(true);
    const result = await sendEstimate(estimateId);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.data?.approvalUrl) {
      setApprovalUrl(result.data.approvalUrl);
      if (result.data.deliveryWarning) {
        // Status flipped to sent and the link exists, but at least one
        // delivery channel failed — manager needs to copy/share manually.
        toast.warning(`Estimate marked sent — ${result.data.deliveryWarning}. Copy the link below to share.`);
      } else {
        toast.success("Estimate sent! Copy the approval link to share.");
      }
    }
  }

  async function handleResend() {
    if (loading) return;
    setLoading(true);
    const result = await resendEstimate(estimateId);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Estimate resent via SMS");
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

  async function handleMarkApproved() {
    if (loading) return;
    setLoading(true);
    const result = await markEstimateApproved(estimateId);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Estimate marked approved");
    router.refresh();
  }

  async function handleMarkDeclined() {
    if (loading) return;
    setLoading(true);
    const result = await markEstimateDeclined(estimateId);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Estimate marked declined");
    router.refresh();
  }

  async function handleConvert() {
    if (loading) return;
    setLoading(true);
    const result = await convertEstimateToJob(estimateId);
    setLoading(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    if ("data" in result && result.data?.jobId) {
      toast.success("Job created from estimate");
      router.push(`/jobs/${result.data.jobId}`);
    }
  }

  async function handleDelete() {
    // DeleteConfirmDialog discards onConfirm's return value, so toast here
    // rather than relying on the caller to surface the rejection.
    if (loading) {
      toast.error("Another action is already in progress");
      return { error: "Already in progress" };
    }
    setLoading(true);
    const result = await deleteEstimate(estimateId);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
      return result;
    }
    toast.success("Estimate deleted");
    if (jobId) {
      router.push(`/jobs/${jobId}`);
    } else if (customerId) {
      router.push(`/customers/${customerId}`);
    } else {
      router.push("/dashboard");
    }
    return result;
  }

  if (status === "draft") {
    return (
      <div className="flex flex-wrap gap-2">
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

        <Button variant="outline" onClick={handleMarkApproved} disabled={loading}>
          <HandCoins className="mr-2 h-4 w-4" />
          Mark approved
        </Button>

        <DeleteConfirmDialog
          title="Delete Estimate"
          description="This will delete the estimate. You can create a new one from the customer's page."
          onConfirm={handleDelete}
          trigger={
            <Button variant="destructive" size="sm" disabled={loading}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          }
        />
      </div>
    );
  }

  if (status === "sent") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleResend} disabled={loading}>
          <RotateCw className="mr-2 h-4 w-4" />
          {loading ? "Sending..." : "Resend"}
        </Button>
        <Button variant="outline" onClick={handleCopyLink}>
          {copied ? (
            <Check className="mr-2 h-4 w-4" />
          ) : (
            <Copy className="mr-2 h-4 w-4" />
          )}
          {copied ? "Copied!" : "Copy link"}
        </Button>

        <Button variant="outline" onClick={handleMarkApproved} disabled={loading}>
          <HandCoins className="mr-2 h-4 w-4" />
          Mark approved
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={loading}>
              <ThumbsDown className="mr-2 h-4 w-4" />
              Mark declined
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark this estimate declined?</AlertDialogTitle>
              <AlertDialogDescription>
                Use this when the customer didn&apos;t move forward — verbally,
                in person, or just ghosted. The estimate stays in the
                customer&apos;s history but stops appearing on the active list.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleMarkDeclined} disabled={loading}>
                Mark declined
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <DeleteConfirmDialog
          title="Delete Estimate"
          description="This estimate has been sent to the customer. Deleting it will invalidate the approval link."
          onConfirm={handleDelete}
          trigger={
            <Button variant="destructive" size="sm" disabled={loading}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          }
        />
      </div>
    );
  }

  if (status === "approved") {
    if (jobId) {
      return (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push(`/jobs/${jobId}`)}>
            View job
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleConvert} disabled={loading}>
          <Workflow className="mr-2 h-4 w-4" />
          {loading ? "Converting..." : "Convert to Job"}
        </Button>
      </div>
    );
  }

  return null;
}
