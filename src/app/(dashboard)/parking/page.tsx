import { Suspense } from "react";
import {
  getParkingDashboard,
  getParkingReservations,
  getParkingCalendarCounts,
} from "@/lib/actions/parking";
import { getLockBoxes } from "@/lib/actions/lock-boxes";
import { todayET } from "@/lib/utils";
import { ParkingTabs } from "@/components/parking/parking-tabs";
import { ParkingTodayView } from "@/components/parking/parking-today-view";
import { ParkingAllView } from "@/components/parking/parking-all-view";
import { ParkingServiceLeads } from "@/components/parking/parking-service-leads";
import { ParkingCalendarView } from "@/components/parking/parking-calendar-view";
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
    month?: string;
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

  if (tab === "calendar") {
    // Resolve month — default to today's month in ET
    const today = todayET();
    const todayDate = new Date(today + "T00:00:00");
    const monthParam = params.month;
    let monthStart: Date;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split("-").map(Number);
      monthStart = new Date(y, m - 1, 1);
    } else {
      monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
    }

    // Calendar grid spans 6 weeks starting from the Sunday before monthStart
    const firstDow = monthStart.getDay();
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - firstDow);
    const gridEnd = new Date(gridStart);
    gridEnd.setDate(gridStart.getDate() + 41);

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const counts = await getParkingCalendarCounts({
      from: fmt(gridStart),
      to: fmt(gridEnd),
      lot,
    });

    return (
      <div className="p-4 lg:p-10 space-y-6">
        <Suspense>
          <ParkingTabs />
        </Suspense>
        <ParkingCalendarView
          monthStart={monthStart}
          todayKey={today}
          counts={counts}
          lot={lot}
        />
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
    dateAny: params.date,
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
