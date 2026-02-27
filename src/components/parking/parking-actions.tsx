"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  checkInReservation,
  checkOutReservation,
  markNoShow,
  cancelReservation,
} from "@/lib/actions/parking";
import { LogIn, LogOut, Ban, XCircle } from "lucide-react";
import type { ParkingStatus } from "@/types";

export function CheckInButton({
  id,
  size = "default",
}: {
  id: string;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [spotNumber, setSpotNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCheckIn() {
    setLoading(true);
    const result = await checkInReservation(id, spotNumber || undefined);
    setLoading(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success("Checked in");
    setOpen(false);
    setSpotNumber("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} className="gap-1.5">
          <LogIn className="h-3.5 w-3.5" />
          Check In
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Check In</DialogTitle>
          <DialogDescription>
            Assign an optional spot number for this vehicle.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="spot">Spot Number</Label>
          <Input
            id="spot"
            placeholder="e.g. A1, B12"
            value={spotNumber}
            onChange={(e) => setSpotNumber(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCheckIn} disabled={loading}>
            {loading ? "Checking in..." : "Check In"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      </div>
    );
  }

  if (status === "checked_in") {
    return (
      <div className="flex flex-wrap gap-2">
        <CheckOutButton id={id} />
      </div>
    );
  }

  return null;
}
