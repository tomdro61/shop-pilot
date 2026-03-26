"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendParkingSpecialsSMS } from "@/lib/actions/messages";
import { Gift, Check } from "lucide-react";

export function SendSpecialsButton({
  reservationId,
  alreadySent = false,
}: {
  reservationId: string;
  alreadySent?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(alreadySent);
  const [confirming, setConfirming] = useState(false);

  async function handleSend(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    setConfirming(false);
    const result = await sendParkingSpecialsSMS(reservationId);
    setLoading(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Specials text sent!");
    setSent(true);
  }

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(true);
  }

  function handleCancel(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-stone-500 dark:text-stone-400">Send specials text?</span>
        <Button
          variant="default"
          size="sm"
          className="gap-1 h-7 text-xs px-2.5"
          onClick={handleSend}
          disabled={loading}
        >
          {loading ? "Sending..." : "Confirm"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={handleCancel}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={sent ? undefined : handleClick}
      disabled={loading || sent}
    >
      {sent ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Gift className="h-3.5 w-3.5" />
      )}
      {sent ? "Specials Sent" : "Send Specials"}
    </Button>
  );
}
