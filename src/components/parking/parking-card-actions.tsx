"use client";

import { Badge } from "@/components/ui/badge";
import { CheckInButton, CheckOutButton } from "@/components/parking/parking-actions";
import { SendSpecialsButton } from "@/components/parking/send-specials-button";
import type { ParkingReservation } from "@/types";

export function ParkingCardActions({
  reservation,
}: {
  reservation: ParkingReservation;
}) {
  const r = reservation;

  if (r.status === "reserved") {
    return <CheckInButton id={r.id} size="sm" />;
  }

  if (r.status === "checked_in") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <CheckOutButton
          id={r.id}
          size="sm"
          customerName={`${r.first_name} ${r.last_name}`}
          customerPhone={r.phone}
        />
        {r.phone && (
          <SendSpecialsButton
            reservationId={r.id}
            alreadySent={!!r.specials_sent_at}
          />
        )}
      </div>
    );
  }

  if (r.status === "checked_out") {
    return (
      <Badge
        variant="secondary"
        className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-0 text-xs"
      >
        Prepared
      </Badge>
    );
  }

  return null;
}
