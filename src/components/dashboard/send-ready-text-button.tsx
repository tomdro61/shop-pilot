"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendVehicleReadySMS } from "@/lib/actions/messages";
import { MessageSquare } from "lucide-react";

export function SendReadyTextButton({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    setLoading(true);
    const result = await sendVehicleReadySMS(jobId);
    setLoading(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Vehicle ready text sent!");
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
      <MessageSquare className="h-3.5 w-3.5" />
      {sent ? "Ready Text Sent" : loading ? "Sending..." : "Send Ready Text"}
    </Button>
  );
}
