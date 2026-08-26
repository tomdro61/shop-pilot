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
import { Input } from "@/components/ui/input";
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
  // Only used when the customer has nothing on file — a counter sale, or someone
  // who never gave us contact details. Sent to once and never stored.
  const [emailInput, setEmailInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");

  const emailDest = customerEmail ?? emailInput.trim();
  const phoneDest = customerPhone ?? phoneInput.trim();
  const canSend = (sendEmail && !!emailDest) || (sendText && !!phoneDest);

  async function handleSend() {
    setLoading(true);
    try {
      const result = await sendJobReceipt({
        jobId,
        email: sendEmail,
        sms: sendText,
        emailTo: customerEmail ? null : emailInput.trim() || null,
        smsTo: customerPhone ? null : phoneInput.trim() || null,
      });

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
              id="receipt-text"
              checked={sendText}
              onCheckedChange={(checked) => setSendText(checked === true)}
            />
            <div className="grid gap-1.5 leading-none flex-1 min-w-0">
              <Label htmlFor="receipt-text">Send via Text</Label>
              {customerPhone ? (
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {customerPhone} · link to this receipt
                </p>
              ) : (
                <>
                  <Input
                    type="tel"
                    inputMode="tel"
                    placeholder="(617) 555-0134"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    disabled={!sendText}
                    className="bg-card"
                  />
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Used for this receipt only — not saved to the customer.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="receipt-email"
              checked={sendEmail}
              onCheckedChange={(checked) => setSendEmail(checked === true)}
            />
            <div className="grid gap-1.5 leading-none flex-1 min-w-0">
              <Label htmlFor="receipt-email">Send via Email</Label>
              {customerEmail ? (
                <p className="text-xs text-stone-500 dark:text-stone-400">{customerEmail}</p>
              ) : (
                <>
                  <Input
                    type="email"
                    inputMode="email"
                    placeholder="name@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    disabled={!sendEmail}
                    className="bg-card"
                  />
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Used for this receipt only — not saved to the customer.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={loading || !canSend}>
            {loading ? "Sending..." : "Send Receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
