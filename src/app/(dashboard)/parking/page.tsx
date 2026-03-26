import { Suspense } from "react";
import { getParkingDashboard, getParkingReservations } from "@/lib/actions/parking";
import { getLockBoxes } from "@/lib/actions/lock-boxes";
import { ParkingTabs } from "@/components/parking/parking-tabs";
import { ParkingTodayView } from "@/components/parking/parking-today-view";
import { ParkingAllView } from "@/components/parking/parking-all-view";
import { ParkingServiceLeads } from "@/components/parking/parking-service-leads";
import type { ParkingStatus } from "@/types";

export const metadata = {
  title: "Airport Parking | ShopPilot",
};

export default async function ParkingPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    lot?: string;
    search?: string;
    status?: string;
    view?: string;
    date?: string;
    dropoff?: string;
    pickup?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const tab = params.tab || "today";
  const lot = params.lot || "Broadway Motors";
  const page = parseInt(params.page || "1", 10) || 1;

  if (tab === "today") {
    const [dashboard, lockBoxes] = await Promise.all([
      getParkingDashboard(lot),
      getLockBoxes(),
    ]);
    const lockBoxCodes: Record<number, string> = {};
    for (const lb of lockBoxes) {
      lockBoxCodes[lb.box_number] = lb.code;
    }
    return (
      <div className="p-4 lg:p-10 space-y-6">
        <Suspense>
          <ParkingTabs />
        </Suspense>
        <ParkingTodayView data={dashboard} lockBoxCodes={lockBoxCodes} />
      </div>
    );
  }

  if (tab === "services") {
    const dashboard = await getParkingDashboard(lot);
    return (
      <div className="p-4 lg:p-10 space-y-6">
        <Suspense>
          <ParkingTabs />
        </Suspense>
        <ParkingServiceLeads reservations={dashboard.serviceLeads} />
      </div>
    );
  }

  // "all" tab — full list with filters
  const result = await getParkingReservations({
    search: params.search,
    status: params.status as ParkingStatus | undefined,
    lot,
    dateFrom: params.from,
    dateTo: params.to,
    dropOffDates: params.dropoff ? params.dropoff.split(",") : undefined,
    pickUpDates: params.pickup ? params.pickup.split(",") : undefined,
    page,
  });

  return (
    <div className="p-4 lg:p-10 space-y-6">
      <Suspense>
        <ParkingTabs />
      </Suspense>
      <ParkingAllView
        reservations={result.data}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </div>
  );
}
