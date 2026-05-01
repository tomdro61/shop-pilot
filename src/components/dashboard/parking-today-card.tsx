import Link from "next/link";

interface ParkingActivity {
  dropOffsToday: number;
  pickupsToday: number;
  pickupsPreparedToday: number;
}

function CalendarTile({ today }: { today: string }) {
  // T12:00:00 anchor avoids UTC midnight rolling back to yesterday.
  const date = new Date(today + "T12:00:00");
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const day = date.getDate();
  return (
    <div
      aria-hidden
      className="flex flex-col items-stretch w-9 rounded-md border border-blue-200 dark:border-blue-900 overflow-hidden flex-none"
    >
      <span className="text-center text-[8px] font-bold uppercase tracking-wider bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 leading-none py-0.5">
        {weekday}
      </span>
      <span className="text-center text-sm font-bold tabular-nums text-stone-900 dark:text-stone-50 bg-card dark:bg-stone-900 leading-none py-1">
        {day}
      </span>
    </div>
  );
}

export function ParkingTodayCard({
  today,
  parking,
}: {
  today: string;
  parking: ParkingActivity;
}) {
  const empty = parking.dropOffsToday === 0 && parking.pickupsToday === 0;
  return (
    <Link
      href="/parking"
      className="group block bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
    >
      <div className="flex items-center justify-between gap-2.5 mb-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 group-hover:text-stone-900 dark:group-hover:text-stone-100 transition-colors">
          Parking · Today
        </span>
        <CalendarTile today={today} />
      </div>
      {empty ? (
        <p className="text-sm text-stone-400 dark:text-stone-500">No activity today</p>
      ) : (
        <div className="flex items-stretch gap-x-5">
          <div className="flex flex-col">
            <span className="font-mono tabular-nums text-2xl font-bold text-stone-900 dark:text-stone-50 leading-none">
              {parking.dropOffsToday}
            </span>
            <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Drop-offs
            </span>
          </div>
          <span aria-hidden className="self-stretch w-px bg-stone-300 dark:bg-stone-700" />
          <div className="flex flex-col">
            {parking.pickupsToday > 0 ? (
              <>
                <span
                  className={
                    parking.pickupsPreparedToday >= parking.pickupsToday
                      ? "font-mono tabular-nums text-2xl font-bold text-emerald-600 dark:text-emerald-400 leading-none"
                      : "font-mono tabular-nums text-2xl font-bold text-red-600 dark:text-red-400 leading-none"
                  }
                >
                  {parking.pickupsPreparedToday}/{parking.pickupsToday}
                </span>
                <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Prepared / Pickups
                </span>
              </>
            ) : (
              <>
                <span className="font-mono tabular-nums text-2xl font-bold text-stone-900 dark:text-stone-50 leading-none">
                  0
                </span>
                <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Pickups
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </Link>
  );
}
