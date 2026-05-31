"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wrench } from "lucide-react";
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
import { convertAppointmentToJob } from "@/lib/actions/appointments";

export function AppointmentConvertButton({
  appointmentId,
  size = "sm",
}: {
  appointmentId: string;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleConvert() {
    if (loading) return;
    setLoading(true);
    const result = await convertAppointmentToJob(appointmentId);
    // On success we navigate to the new job; keep loading=true through the
    // transition so the button can't re-fire. On failure, re-enable + surface it.
    if (!result.ok) {
      setLoading(false);
      toast.error(result.error);
      return;
    }
    toast.success("Job created from appointment");
    router.push(`/jobs/${result.data.jobId}`);
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size={size} disabled={loading}>
          <Wrench className="mr-1.5 h-3.5 w-3.5" />
          Convert to job
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Convert to a job?</AlertDialogTitle>
          <AlertDialogDescription>
            Creates a job (Not started) from this appointment&apos;s customer,
            vehicle, and service, and moves the appointment to history. Any
            photos stay on the appointment.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <AlertDialogAction onClick={handleConvert} disabled={loading}>
            {loading ? "Converting..." : "Convert to job"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
