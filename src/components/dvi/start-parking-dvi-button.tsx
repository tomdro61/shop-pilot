"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startParkingDvi } from "@/lib/actions/dvi";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface StartParkingDviButtonProps {
  reservationId: string;
}

export function StartParkingDviButton({ reservationId }: StartParkingDviButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [started, setStarted] = useState(false);

  function handleClick() {
    startTransition(async () => {
      const result = await startParkingDvi(reservationId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setStarted(true);
      router.push(`/dvi/inspect/${result.data!.inspectionId}`);
    });
  }

  return (
    <Button
      onClick={handleClick}
      disabled={isPending || started}
      size="sm"
      className="rounded-full"
    >
      {isPending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
      )}
      Start DVI
    </Button>
  );
}
