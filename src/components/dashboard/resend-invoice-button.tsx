"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { resendInvoiceForJob } from "@/lib/actions/invoices";
import { Send } from "lucide-react";

interface ResendInvoiceButtonProps {
  jobId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  /** Null means unknown (pre-migration invoice), never "not yet sent". */
  lastSentAt: string | null;
  /** Draft with no recorded send — this is a first delivery, not a reminder. */
  neverSent: boolean;
}

const RECENT_SEND_MS = 24 * 60 * 60 * 1000;

function describeGap(from: string): string {
  const hours = Math.floor((Date.now() - new Date(from).getTime()) / (60 * 60 * 1000));
  if (hours < 1) return "less than an hour ago";
  if (hours === 1) return "1 hour ago";
  return `${hours} hours ago`;
}

export function ResendInvoiceButton({
  jobId,
  customerEmail,
  customerPhone,
  lastSentAt,
  neverSent,
}: ResendInvoiceButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendEmail, setSendEmail] = useState(!!customerEmail);
  const [sendText, setSendText] = useState(!!customerPhone);
  const [confirmedRecent, setConfirmedRecent] = useState(false);

  const verb = neverSent ? "Send" : "Resend";

  // Soft throttle: two people chasing the same non-payer shouldn't text them
  // twice in an afternoon. A warning with a second click, not a hard block —
  // sometimes the second nudge is the intended one.
  const sentRecently =
    !!lastSentAt && Date.now() - new Date(lastSentAt).getTime() < RECENT_SEND_MS;
  const needsConfirm = sentRecently && !confirmedRecent;

  function reset(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setConfirmedRecent(false);
  }

  async function handleSend() {
    if (needsConfirm) {
      setConfirmedRecent(true);
      return;
    }

    setLoading(true);
    try {
      const result = await resendInvoiceForJob({ jobId, email: sendEmail, sms: sendText });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const { email, sms } = result;
      const ok: string[] = [];
      const failed: string[] = [];
      if (email) (email.sent ? ok : failed).push(email.sent ? "email" : `email (${email.error})`);
      if (sms) (sms.sent ? ok : failed).push(sms.sent ? "text" : `text (${sms.error})`);

      // testMode = Quo/Resend unconfigured — nothing left the building, so don't
      // claim it did.
      let testMode = false;
      if (email?.sent) testMode ||= !!email.testMode;
      if (sms?.sent) testMode ||= !!sms.testMode;
      const suffix = testMode ? " (test mode — nothing actually sent)" : "";

      if (ok.length === 0) {
        toast.error(`Couldn't send: ${failed.join(", ")}`);
        return;
      }

      if (failed.length > 0) {
        // Partial — uncheck what succeeded so a retry only re-sends what didn't,
        // and keep the dialog open.
        if (email?.sent) setSendEmail(false);
        if (sms?.sent) setSendText(false);
        toast.warning(`Sent via ${ok.join(" & ")}. Failed: ${failed.join(", ")}`);
        return;
      }

      toast.success(`Invoice sent via ${ok.join(" & ")}${suffix}`);
      if (result.stampWarning) toast.warning(result.stampWarning);
      reset(false);
    } catch {
      // The action can still throw (network, serialization). Without this the
      // button would stay disabled with no explanation.
      toast.error("Couldn't send the invoice — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Send className="mr-1.5 h-3.5 w-3.5" />
          {verb}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{verb} Invoice</DialogTitle>
          <DialogDescription>
            {neverSent
              ? "This invoice hasn't been sent yet. Choose how to deliver the payment link."
              : "Send the customer their payment link again. Choose how to deliver it."}
          </DialogDescription>
        </DialogHeader>

        {sentRecently && lastSentAt && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Already sent {describeGap(lastSentAt)}.
            {needsConfirm ? " Click again to send anyway." : " Sending again."}
          </p>
        )}

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3">
            <Checkbox
              id="resend-email"
              checked={sendEmail}
              onCheckedChange={(checked) => setSendEmail(checked === true)}
              disabled={!customerEmail}
            />
            <div className="grid gap-0.5 leading-none">
              <Label htmlFor="resend-email" className={!customerEmail ? "text-stone-500" : ""}>
                Send via Email
              </Label>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {customerEmail || "No email address on file"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="resend-text"
              checked={sendText}
              onCheckedChange={(checked) => setSendText(checked === true)}
              disabled={!customerPhone}
            />
            <div className="grid gap-0.5 leading-none">
              <Label htmlFor="resend-text" className={!customerPhone ? "text-stone-500" : ""}>
                Send via Text
              </Label>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {customerPhone ? `${customerPhone} · link to pay` : "No phone number on file"}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => reset(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={loading || (!sendEmail && !sendText)}>
            {loading ? "Sending..." : needsConfirm ? "Send anyway" : `${verb} Invoice`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
