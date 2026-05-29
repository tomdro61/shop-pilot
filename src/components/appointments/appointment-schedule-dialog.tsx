"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  confirmAppointment,
  rescheduleAppointment,
} from "@/lib/actions/appointments";

// Confirm-with-time (pending → confirmed) and reschedule (confirmed → new time)
// share this dialog. CRITICAL: the date/time `<input>`s yield raw ET wall-clock
// strings (YYYY-MM-DD, HH:MM); we hand them to the server verbatim as
// {etDate, etTime}. The ONLY timezone conversion is etDateTimeToUtcIso(), once,
// server-side. Never build a Date() from these values here — that would let the
// browser's timezone double-shift the stored time.
export function AppointmentScheduleDialog({
  appointmentId,
  mode,
  defaultEtDate,
  defaultEtTime,
  requestedLabel,
  triggerLabel,
  triggerVariant = "default",
  triggerSize = "sm",
  fullWidthTrigger = false,
}: {
  appointmentId: string;
  mode: "confirm" | "reschedule";
  defaultEtDate: string; // YYYY-MM-DD, ET
  defaultEtTime: string; // HH:MM (24h), ET
  requestedLabel: string;
  triggerLabel: string;
  triggerVariant?: "default" | "outline";
  triggerSize?: "sm" | "default";
  fullWidthTrigger?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultEtDate);
  const [time, setTime] = useState(defaultEtTime);
  const [loading, setLoading] = useState(false);

  const Icon = mode === "confirm" ? CalendarCheck : CalendarClock;

  // Reset to the defaults each open so an abandoned edit doesn't linger.
  function openDialog() {
    setDate(defaultEtDate);
    setTime(defaultEtTime);
    setOpen(true);
  }

  async function handleSubmit() {
    if (loading) return;
    if (!date || !time) {
      toast.error("Pick a date and a time.");
      return;
    }
    setLoading(true);
    const action = mode === "confirm" ? confirmAppointment : rescheduleAppointment;
    const result = await action(appointmentId, { etDate: date, etTime: time });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    // Tell the truth about the text: confirm/reschedule succeed even when the
    // best-effort SMS doesn't, so don't claim "text sent" unless it actually did.
    const verb = mode === "confirm" ? "Confirmed" : "Rescheduled";
    if (result.data.smsSent) {
      toast.success(`${verb} — text sent to the customer`);
    } else {
      toast.warning(`${verb} — but the text didn't send. Call the customer to confirm.`);
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        onClick={openDialog}
        className={fullWidthTrigger ? "w-full" : undefined}
      >
        <Icon className="mr-1.5 h-3.5 w-3.5" />
        {triggerLabel}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Don't let Escape / outside-click dismiss the dialog mid-submit —
          // otherwise the success toast + refresh fire on a closed dialog and
          // the manager can't tell if it worked.
          if (!loading) setOpen(next);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === "confirm" ? "Confirm appointment" : "Reschedule appointment"}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-stone-500 dark:text-stone-400">
            {mode === "confirm"
              ? "Set the exact day and time. The customer gets a confirmation text."
              : "Pick a new day and time. The customer gets an updated text."}
          </p>

          {/* The customer's request stays in view so you're never confirming blind. */}
          <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-800 dark:bg-stone-900/60">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              {mode === "confirm" ? "Customer requested" : "Currently scheduled"}
            </p>
            <p className="mt-0.5 text-sm font-medium text-stone-900 dark:text-stone-50">
              {requestedLabel}
            </p>
          </div>

          <div className="grid gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                Date
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 h-11 w-full rounded-md border border-stone-200 bg-stone-50 px-3 text-sm font-mono tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-stone-800 dark:bg-stone-900/60"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                Time
              </span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1 h-11 w-full rounded-md border border-stone-200 bg-stone-50 px-3 text-sm font-mono tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-stone-800 dark:bg-stone-900/60"
              />
            </label>
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Back
            </Button>
            <Button onClick={handleSubmit} disabled={loading || !date || !time}>
              {loading
                ? "Sending..."
                : mode === "confirm"
                  ? "Confirm & text"
                  : "Reschedule & text"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
