"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendParkingSpecialsSMS } from "@/lib/actions/messages";
import { Gift } from "lucide-react";

export function SendSpecialsButton({ reservationId }: { reservationId: string }) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    setLoading(true);
    const result = await sendParkingSpecialsSMS(reservationId);
    setLoading(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Specials text sent!");
    setSent(true);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={handleSend}
      disabled={loading || sent}
    >
      <Gift className="h-3.5 w-3.5" />
      {sent ? "Specials Sent" : loading ? "Sending..." : "Send Specials"}
    </Button>
  );
}
