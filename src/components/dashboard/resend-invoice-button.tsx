"use client";

import { useState } from "react";
import * as Sentry from "@sentry/nextjs";
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
import { describeGap, wasSentRecently } from "@/lib/invoices/delivery";
import { TONE_CLASSES } from "@/lib/ui/alert-tone";
import { cn } from "@/lib/utils";
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
  const sentRecently = wasSentRecently(lastSentAt);
  const needsConfirm = sentRecently && !confirmedRecent;

  // Resets ALL dialog state, not just the confirm. Without the channel reset, a
  // partial failure leaves the succeeded channel unchecked (correct for an
  // in-place retry) and it stays unchecked after close/reopen with nothing on
  // screen explaining why — useState initializers don't re-run, since Radix
  // unmounts only the content.
  function reset(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setConfirmedRecent(false);
      setSendEmail(!!customerEmail);
      setSendText(!!customerPhone);
    }
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
      // claim it did. Applies to the partial branch too: previously this was
      // computed here and only appended on the all-succeeded path, so a partial
      // send in test mode reported a delivery that never happened.
      let testMode = false;
      if (email?.sent) testMode ||= !!email.testMode;
      if (sms?.sent) testMode ||= !!sms.testMode;
      const suffix = testMode ? " (test mode — nothing actually sent)" : "";

      if (failed.length > 0) {
        // Partial — uncheck what succeeded so a retry only re-sends what didn't,
        // and keep the dialog open.
        if (email?.sent) setSendEmail(false);
        if (sms?.sent) setSendText(false);
        toast.warning(`Sent via ${ok.join(" & ")}${suffix}. Failed: ${failed.join(", ")}`);
      } else {
        toast.success(`Invoice sent via ${ok.join(" & ")}${suffix}`);
        reset(false);
      }

      // Outside the branch: a failed last_sent_at write disables the throttle,
      // and the partial path is exactly where a retry is being invited.
      if (result.stampWarning) toast.warning(result.stampWarning);
    } catch (err) {
      // The action can still throw (network drop, serialization, a 500 at the
      // action boundary). Deliberately does NOT claim the send failed: if the
      // connection dropped on the RESPONSE, the text already went out and
      // last_sent_at was already stamped — but revalidatePath never reached the
      // client, so the throttle won't warn on the retry this toast invites.
      Sentry.captureException(err, {
        tags: { source: "resend-invoice", path: "client-invoke" },
        extra: { jobId },
      });
      toast.error(
        "We couldn't confirm whether the invoice sent — check the customer's messages before resending"
      );
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
          // role="status" because the text mutates in response to a click and
          // the confirm step fires no toast — without it a screen-reader user
          // gets no announcement at all when arming the send.
          <p
            role="status"
            className={cn("rounded-md border px-3 py-2 text-xs", TONE_CLASSES.amber.chip)}
          >
            Already sent {describeGap(lastSentAt)}.
            {needsConfirm
              ? " Click again to send anyway."
              : " Press send to deliver it again."}
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
            {/* Stays "Send anyway" for the whole throttled interaction. Reverting
                to the resting label after the confirm click reads as "done". */}
            {loading ? "Sending..." : sentRecently ? "Send anyway" : `${verb} Invoice`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
