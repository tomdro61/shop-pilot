"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteJob } from "@/lib/actions/jobs";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

export function JobDeleteButton({ jobId }: { jobId: string }) {
  const router = useRouter();

  async function handleDelete() {
    const result = await deleteJob(jobId);
    if (result.error) {
      toast.error(result.error);
      return result;
    }
    toast.success("Job deleted");
    router.push("/jobs");
    return result;
  }

  return (
    <DeleteConfirmDialog
      title="Delete Job"
      description="Are you sure you want to delete this job? All line items will also be deleted. This cannot be undone."
      onConfirm={handleDelete}
    />
  );
}
