import { Suspense } from "react";
import { getParkingDashboard, getParkingReservations } from "@/lib/actions/parking";
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
    const dashboard = await getParkingDashboard(lot);
    return (
      <div className="p-4 lg:p-6 space-y-5">
        <Suspense>
          <ParkingTabs />
        </Suspense>
        <ParkingTodayView data={dashboard} />
      </div>
    );
  }

  if (tab === "services") {
    const dashboard = await getParkingDashboard(lot);
    return (
      <div className="p-4 lg:p-6 space-y-5">
        <Suspense>
          <ParkingTabs />
        </Suspense>
        <ParkingServiceLeads reservations={dashboard.serviceLeads} />
      </div>
    );
  }

  // "all" tab — full list with filters
  const view = params.view || "all";
  const result = await getParkingReservations({
    search: params.search,
    status: params.status as ParkingStatus | undefined,
    lot,
    dateFrom: params.from,
    dateTo: params.to,
    dropOffDate: view === "arrivals" ? params.date : undefined,
    pickUpDate: view === "pickups" ? params.date : undefined,
    dateAny: view === "all" ? params.date : undefined,
    page,
  });

  return (
    <div className="p-4 lg:p-6 space-y-5">
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
