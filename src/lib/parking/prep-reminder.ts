import { createAdminClient } from "@/lib/supabase/admin";
import { todayET, tomorrowET } from "@/lib/utils";
import type { Database } from "@/types/supabase";

export type PrepReminderRow = Pick<
  Database["public"]["Tables"]["parking_reservations"]["Row"],
  | "id"
  | "first_name"
  | "last_name"
  | "make"
  | "model"
  | "pick_up_date"
  | "pick_up_time"
  | "status"
  | "lock_box_number"
>;

export interface UnpreppedCar {
  id: string;
  name: string;
  vehicle: string;
  pickUp: string;
  reason: "not pulled out" | "checked out, no lockbox code sent";
}

// The shop is closed 5 PM → 9 AM. A car due for pickup inside that window has
// to be pulled out and staged in a lockbox BEFORE close, because no one's here
// to hand over keys. Compared against the "HH:MM" prefix of the Postgres `time`
// value; window is [17:00, 09:00) — inclusive of close, exclusive of open.
const WINDOW_START = "17:00"; // shop closes
const WINDOW_END = "09:00"; // shop opens

function inClosedWindow(
  pickUpDate: string,
  pickUpTime: string,
  today: string,
  tomorrow: string
): boolean {
  const hhmm = pickUpTime.slice(0, 5);
  if (pickUpDate === today) return hhmm >= WINDOW_START;
  if (pickUpDate === tomorrow) return hhmm < WINDOW_END;
  return false;
}

function formatPickup(pickUpDate: string, pickUpTime: string, today: string): string {
  const [h, m] = pickUpTime.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const time = `${display}:${m} ${ampm}`;
  // A "today" pickup in-window is always an evening time; "tomorrow" is morning.
  return pickUpDate === today ? `${time} tonight` : `${time} tomorrow`;
}

/**
 * Of the given reservations, the ones due in tonight's closed window that
 * aren't fully prepped — i.e. NOT (checked out AND keys in a lockbox). That
 * covers both "car never pulled out" (reserved/checked_in) and "checked out in
 * person, no lockbox code sent." Split out from the query so the window and
 * classification logic is unit-testable without a database; the caller's query
 * is responsible for excluding cancelled/no-show rows.
 */
export function selectUnpreppedCars(
  rows: PrepReminderRow[],
  today: string,
  tomorrow: string
): UnpreppedCar[] {
  return rows
    .filter((r) => inClosedWindow(r.pick_up_date, r.pick_up_time, today, tomorrow))
    .filter((r) => !(r.status === "checked_out" && r.lock_box_number != null))
    .map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name.charAt(0)}.`,
      vehicle: [r.make, r.model].filter(Boolean).join(" "),
      pickUp: formatPickup(r.pick_up_date, r.pick_up_time, today),
      // Rows here already failed the prepped test, so a checked_out one
      // necessarily has no lockbox number.
      reason:
        r.status === "checked_out"
          ? "checked out, no lockbox code sent"
          : "not pulled out",
    }));
}

type FindResult =
  | { ok: true; cars: UnpreppedCar[] }
  | { ok: false; error: string };

/**
 * Broadway Motors reservations due for pickup during tonight's closed window
 * that aren't fully prepped. Returns a discriminated result so the caller can
 * fail loud on a query error instead of treating a broken query as "nothing to
 * flag."
 */
export async function findUnpreppedCarsForTonight(): Promise<FindResult> {
  const supabase = createAdminClient();
  const today = todayET();
  const tomorrow = tomorrowET();

  const { data, error } = await supabase
    .from("parking_reservations")
    .select(
      "id, first_name, last_name, make, model, pick_up_date, pick_up_time, status, lock_box_number"
    )
    .eq("lot", "Broadway Motors")
    .in("pick_up_date", [today, tomorrow])
    .not("status", "in", "(cancelled,no_show)")
    .order("pick_up_date", { ascending: true })
    .order("pick_up_time", { ascending: true });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, cars: selectUnpreppedCars(data ?? [], today, tomorrow) };
}
