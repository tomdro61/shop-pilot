"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { duplicateJob } from "@/lib/actions/jobs";

export function JobDuplicateButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDuplicate() {
    if (loading) return;
    setLoading(true);
    let result: Awaited<ReturnType<typeof duplicateJob>>;
    try {
      result = await duplicateJob(jobId);
    } catch {
      toast.error("Something went wrong — try again");
      return;
    } finally {
      setLoading(false);
    }

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Job copied");
    router.push(`/jobs/${result.data.id}`);
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading}>
          <CopyPlus className="mr-1.5 h-3.5 w-3.5" />
          Duplicate
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Duplicate this job?</AlertDialogTitle>
          <AlertDialogDescription>
            A new job is created for the same customer and vehicle with the
            title, notes, and line items copied. It starts as not started,
            unpaid, and dated today. The estimate, invoice, and inspection on
            this job are not copied.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDuplicate} disabled={loading}>
            {loading ? "Copying..." : "Duplicate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
