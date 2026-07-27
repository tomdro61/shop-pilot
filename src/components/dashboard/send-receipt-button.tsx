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
import { sendJobReceipt } from "@/lib/actions/receipts";
import { Receipt } from "lucide-react";

interface SendReceiptButtonProps {
  jobId: string;
  customerEmail: string | null;
  customerPhone: string | null;
}

export function SendReceiptButton({ jobId, customerEmail, customerPhone }: SendReceiptButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendEmail, setSendEmail] = useState(!!customerEmail);
  const [sendText, setSendText] = useState(!!customerPhone);

  async function handleSend() {
    setLoading(true);
    try {
      const result = await sendJobReceipt({ jobId, email: sendEmail, sms: sendText });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const { email, sms } = result;
      const ok: string[] = [];
      const failed: string[] = [];
      if (email) (email.sent ? ok : failed).push(email.sent ? "email" : `email (${email.error})`);
      if (sms) (sms.sent ? ok : failed).push(sms.sent ? "text" : `text (${sms.error})`);

      // testMode = Quo/Resend unconfigured (local dev) — nothing actually left
      // the building, so don't claim it did.
      let testMode = false;
      if (email && email.sent) testMode ||= !!email.testMode;
      if (sms && sms.sent) testMode ||= !!sms.testMode;
      const suffix = testMode ? " (test mode — nothing actually sent)" : "";

      if (failed.length === 0) {
        toast.success(`Receipt sent via ${ok.join(" & ")}${suffix}`);
        setOpen(false);
      } else if (ok.length > 0) {
        // Partial — uncheck the channel(s) that succeeded so a retry only re-sends
        // what failed, and keep the dialog open.
        if (email && email.sent) setSendEmail(false);
        if (sms && sms.sent) setSendText(false);
        toast.warning(`Sent via ${ok.join(" & ")}. Failed: ${failed.join(", ")}`);
      } else {
        toast.error(`Couldn't send receipt: ${failed.join(", ")}`);
      }
    } catch {
      toast.error("Couldn't send the receipt — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Receipt className="mr-1.5 h-3.5 w-3.5" />
          Send Receipt
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Receipt</DialogTitle>
          <DialogDescription>
            Send the customer their itemized, paid receipt. Choose how to deliver it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3">
            <Checkbox
              id="receipt-email"
              checked={sendEmail}
              onCheckedChange={(checked) => setSendEmail(checked === true)}
              disabled={!customerEmail}
            />
            <div className="grid gap-0.5 leading-none">
              <Label htmlFor="receipt-email" className={!customerEmail ? "text-stone-500" : ""}>
                Send via Email
              </Label>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {customerEmail || "No email address on file"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="receipt-text"
              checked={sendText}
              onCheckedChange={(checked) => setSendText(checked === true)}
              disabled={!customerPhone}
            />
            <div className="grid gap-0.5 leading-none">
              <Label htmlFor="receipt-text" className={!customerPhone ? "text-stone-500" : ""}>
                Send via Text
              </Label>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {customerPhone ? `${customerPhone} · link to this receipt` : "No phone number on file"}
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={loading || (!sendEmail && !sendText)}>
            {loading ? "Sending..." : "Send Receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
