"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Wrench, Loader2 } from "lucide-react";
import { prepareJobFromReservation } from "@/lib/actions/parking";

export function CreateJobButton({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  async function handleClick() {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);

    const result = await prepareJobFromReservation(reservationId);

    if ("error" in result) {
      toast.error(result.error);
      setLoading(false);
      inFlight.current = false;
      return;
    }

    router.push(result.url);
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={loading}>
      {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wrench className="mr-1.5 h-3.5 w-3.5" />}
      Create Job
    </Button>
  );
}
