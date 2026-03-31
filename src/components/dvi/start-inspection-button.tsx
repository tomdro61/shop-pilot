"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { startInspection } from "@/lib/actions/dvi";
import { Button } from "@/components/ui/button";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

export function StartInspectionButton({ jobId }: { jobId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleStart() {
    startTransition(async () => {
      const result = await startInspection(jobId);
      if ("error" in result) {
        toast.error(typeof result.error === "string" ? result.error : "Failed to start inspection");
        return;
      }
      router.push(`/tech/${jobId}/inspect`);
    });
  }

  return (
    <Button onClick={handleStart} disabled={isPending} className="w-full">
      <ClipboardCheck className="mr-2 h-4 w-4" />
      {isPending ? "Starting..." : "Start Inspection"}
    </Button>
  );
}
