"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  checkInReservation,
  checkOutReservation,
  markNoShow,
  cancelReservation,
  deleteReservation,
} from "@/lib/actions/parking";
import { LogIn, LogOut, Ban, XCircle, Trash2 } from "lucide-react";
import type { ParkingStatus } from "@/types";

export function CheckInButton({
  id,
  size = "default",
}: {
  id: string;
  size?: "default" | "sm";
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCheckIn() {
    setLoading(true);
    const result = await checkInReservation(id);
    setLoading(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success("Checked in");
    router.refresh();
  }

  return (
    <Button
      size={size}
      className="gap-1.5"
      onClick={handleCheckIn}
      disabled={loading}
    >
      <LogIn className="h-3.5 w-3.5" />
      {loading ? "..." : "Check In"}
    </Button>
  );
}

export function CheckOutButton({
  id,
  size = "default",
}: {
  id: string;
  size?: "default" | "sm";
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCheckOut() {
    setLoading(true);
    const result = await checkOutReservation(id);
    setLoading(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success("Checked out");
    router.refresh();
  }

  return (
    <Button
      size={size}
      variant="outline"
      className="gap-1.5"
      onClick={handleCheckOut}
      disabled={loading}
    >
      <LogOut className="h-3.5 w-3.5" />
      {loading ? "..." : "Check Out"}
    </Button>
  );
}

export function NoShowButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleNoShow() {
    setLoading(true);
    const result = await markNoShow(id);
    setLoading(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success("Marked as no-show");
    router.refresh();
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5 text-red-600 dark:text-red-400"
      onClick={handleNoShow}
      disabled={loading}
    >
      <Ban className="h-3.5 w-3.5" />
      {loading ? "..." : "No Show"}
    </Button>
  );
}

export function CancelButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCancel() {
    setLoading(true);
    const result = await cancelReservation(id);
    setLoading(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success("Reservation cancelled");
    router.refresh();
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5 text-amber-600 dark:text-amber-400"
      onClick={handleCancel}
      disabled={loading}
    >
      <XCircle className="h-3.5 w-3.5" />
      {loading ? "..." : "Cancel"}
    </Button>
  );
}

export function DeleteReservationButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    setLoading(true);
    const result = await deleteReservation(id);
    setLoading(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success("Reservation deleted");
    router.push("/parking");
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-600 dark:text-red-400">Delete this reservation?</span>
        <Button
          size="sm"
          variant="destructive"
          className="gap-1.5"
          onClick={handleDelete}
          disabled={loading}
        >
          {loading ? "..." : "Yes, Delete"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirming(false)}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5 text-red-600 dark:text-red-400"
      onClick={() => setConfirming(true)}
    >
      <Trash2 className="h-3.5 w-3.5" />
      Delete
    </Button>
  );
}

export function ParkingActionButtons({
  id,
  status,
}: {
  id: string;
  status: ParkingStatus;
}) {
  if (status === "reserved") {
    return (
      <div className="flex flex-wrap gap-2">
        <CheckInButton id={id} />
        <NoShowButton id={id} />
        <CancelButton id={id} />
        <DeleteReservationButton id={id} />
      </div>
    );
  }

  if (status === "checked_in") {
    return (
      <div className="flex flex-wrap gap-2">
        <CheckOutButton id={id} />
        <DeleteReservationButton id={id} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <DeleteReservationButton id={id} />
    </div>
  );
}
