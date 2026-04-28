import { notFound } from "next/navigation";
import Link from "next/link";
import { getParkingReservation } from "@/lib/actions/parking";
import { getInvoicesForParkingReservation } from "@/lib/actions/invoices";
import { getLockBoxes } from "@/lib/actions/lock-boxes";
import { Button } from "@/components/ui/button";
import {
  PARKING_STATUS_LABELS,
  PARKING_STATUS_COLORS,
} from "@/lib/constants";
import { ParkingActionButtons } from "@/components/parking/parking-actions";
import { SendSpecialsButton } from "@/components/parking/send-specials-button";
import { ParkingNotesForm } from "@/components/parking/parking-notes-form";
import { ParkingDatesForm } from "@/components/parking/parking-dates-form";
import { ParkingServicesForm } from "@/components/parking/parking-services-form";
import { ParkingVehicleForm } from "@/components/parking/parking-vehicle-form";
import { ParkingValetForm } from "@/components/parking/parking-valet-form";
import { ParkingInvoiceSection } from "@/components/parking/parking-invoice-section";
import { CreateJobButton } from "@/components/parking/create-job-button";
import { CustomerLink } from "@/components/ui/customer-link";
import { SectionTitle } from "@/components/ui/section-title";
import { SECTION_LABEL } from "@/components/ui/section-card";
import {
  formatCustomerName,
  formatPhone,
  formatDateLong,
  getInitials,
} from "@/lib/utils/format";
import {
  ArrowLeft,
  Check,
  Clock,
  KeyRound,
  Plane,
  Truck,
  User as UserIcon,
} from "lucide-react";
import type { ParkingStatus } from "@/types";

const TILE = "bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const reservation = await getParkingReservation(id);
  if (!reservation) return { title: "Not Found | ShopPilot" };
  return {
    title: `${reservation.first_name} ${reservation.last_name} — Parking | ShopPilot`,
  };
}

function formatTimestamp(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ParkingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [reservation, invoices] = await Promise.all([
    getParkingReservation(id),
    getInvoicesForParkingReservation(id),
  ]);

  if (!reservation) notFound();

  let lockBoxCode: string | null = null;
  if (reservation.status === "checked_out" && reservation.lock_box_number) {
    const lockBoxes = await getLockBoxes();
    lockBoxCode = lockBoxes.find(lb => lb.box_number === reservation.lock_box_number)?.code ?? null;
  }

  const status = reservation.status as ParkingStatus;
  const statusColors = PARKING_STATUS_COLORS[status];
  const customerName = formatCustomerName(reservation);
  const initials = getInitials(customerName);

  // Status stepper config
  const STEPPER: { key: string; label: string; ts: string | null }[] = [
    { key: "reserved", label: "Reserved", ts: reservation.created_at },
    { key: "checked_in", label: "Checked In", ts: reservation.checked_in_at },
    { key: "checked_out", label: "Checked Out", ts: reservation.checked_out_at },
  ];
  const isTerminal = status === "checked_out" || status === "no_show" || status === "cancelled";
  const currentIdx = status === "reserved" ? 0 : status === "checked_in" ? 1 : 2;

  let sectionNum = 1;
  const nextNum = () => String(sectionNum++).padStart(2, "0");

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 pb-24 lg:pb-12 space-y-5 lg:space-y-6">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 py-2">
        <Link href="/parking">
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Parking
          </Button>
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <ParkingActionButtons
            id={reservation.id}
            status={status}
            customerName={customerName}
            customerPhone={reservation.phone}
          />
          {status === "checked_in" && reservation.phone && (
            <SendSpecialsButton
              reservationId={reservation.id}
              alreadySent={!!reservation.specials_sent_at}
            />
          )}
          {reservation.customer_id && (
            <CreateJobButton reservationId={reservation.id} />
          )}
        </div>
      </div>

      {/* Hero card */}
      <section className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
        {/* Header — meta line + title + status/type pills */}
        <div className="px-5 lg:px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-mono tabular-nums text-[11px] tracking-wide text-stone-500 dark:text-stone-400">
                #{reservation.confirmation_number}
                <span className="mx-1.5 text-stone-300 dark:text-stone-700">·</span>
                <span className="font-sans">{reservation.lot}</span>
                <span className="mx-1.5 text-stone-300 dark:text-stone-700">·</span>
                Created {formatDateLong(reservation.created_at) ?? "—"}
              </div>
              <h1 className="mt-1.5 text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50 truncate">
                {reservation.customer_id ? (
                  <CustomerLink customerId={reservation.customer_id}>
                    {customerName}
                  </CustomerLink>
                ) : (
                  customerName
                )}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {reservation.parking_type === "shuttle" && (
                <span className="text-[10px] font-black px-2 py-1 rounded-md uppercase bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400">
                  Shuttle
                </span>
              )}
              {reservation.parking_type === "valet" && (
                <span className="text-[10px] font-black px-2 py-1 rounded-md uppercase bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400">
                  Valet
                </span>
              )}
              <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${statusColors.bg} ${statusColors.text}`}>
                {PARKING_STATUS_LABELS[status]}
              </span>
            </div>
          </div>
        </div>

        {/* 3-column data strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-stone-100 dark:divide-stone-800/60 border-t border-stone-100 dark:border-stone-800/60">
          {/* Customer */}
          <div className="px-5 py-5 flex flex-col gap-4 min-w-0">
            <div className={`${SECTION_LABEL} flex items-center gap-1.5`}>
              <UserIcon className="h-3 w-3" /> Customer
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-md grid place-items-center text-sm font-semibold bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900 flex-none">
                {initials}
              </div>
              <div className="min-w-0">
                {reservation.customer_id ? (
                  <CustomerLink
                    customerId={reservation.customer_id}
                    className="block text-sm font-semibold text-stone-900 dark:text-stone-50 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                  >
                    {customerName}
                  </CustomerLink>
                ) : (
                  <div className="block text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                    {customerName}
                  </div>
                )}
              </div>
            </div>
            <dl className="grid grid-cols-[60px_1fr] gap-x-2 gap-y-1.5 text-xs items-center min-w-0">
              <dt className={SECTION_LABEL}>Phone</dt>
              <dd className="min-w-0 flex items-center gap-1.5 flex-wrap">
                {reservation.phone ? (
                  <>
                    <span className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                      {formatPhone(reservation.phone)}
                    </span>
                    <a href={`tel:${reservation.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">Call</a>
                    <a href={`sms:${reservation.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">Text</a>
                  </>
                ) : (
                  <span className="text-stone-400">—</span>
                )}
              </dd>
              <dt className={SECTION_LABEL}>Email</dt>
              <dd className="min-w-0 truncate">
                {reservation.email ? (
                  <a href={`mailto:${reservation.email}`} className="text-stone-900 dark:text-stone-50 hover:text-blue-600 dark:hover:text-blue-400 truncate">
                    {reservation.email}
                  </a>
                ) : (
                  <span className="text-stone-400">—</span>
                )}
              </dd>
            </dl>
          </div>

          {/* Vehicle (editable) */}
          <div className="px-5 py-5 flex flex-col gap-3 min-w-0">
            <div className={`${SECTION_LABEL} flex items-center gap-1.5`}>
              <Truck className="h-3 w-3" /> Vehicle
            </div>
            <ParkingVehicleForm
              id={reservation.id}
              make={reservation.make}
              model={reservation.model}
              licensePlate={reservation.license_plate}
              color={reservation.color}
            />
          </div>

          {/* Trip (editable) */}
          <div className="px-5 py-5 flex flex-col gap-3 min-w-0">
            <div className={`${SECTION_LABEL} flex items-center gap-1.5`}>
              <Clock className="h-3 w-3" /> Trip
            </div>
            <ParkingDatesForm
              id={reservation.id}
              dropOffDate={reservation.drop_off_date}
              dropOffTime={reservation.drop_off_time}
              pickUpDate={reservation.pick_up_date}
              pickUpTime={reservation.pick_up_time}
            />
            {(reservation.departing_flight || reservation.arriving_flight) && (
              <dl className="grid grid-cols-[60px_1fr] gap-x-2 gap-y-1.5 text-xs items-center min-w-0 pt-2 border-t border-stone-100 dark:border-stone-800/60">
                {reservation.departing_flight && (
                  <>
                    <dt className={SECTION_LABEL}>
                      <span className="inline-flex items-center gap-1">
                        <Plane className="h-3 w-3 -rotate-45" /> Dep
                      </span>
                    </dt>
                    <dd className="font-mono tabular-nums uppercase text-stone-900 dark:text-stone-50 truncate">
                      {reservation.departing_flight}
                    </dd>
                  </>
                )}
                {reservation.arriving_flight && (
                  <>
                    <dt className={SECTION_LABEL}>
                      <span className="inline-flex items-center gap-1">
                        <Plane className="h-3 w-3 rotate-45" /> Arr
                      </span>
                    </dt>
                    <dd className="font-mono tabular-nums uppercase text-stone-900 dark:text-stone-50 truncate">
                      {reservation.arriving_flight}
                    </dd>
                  </>
                )}
              </dl>
            )}
          </div>
        </div>

        {/* Staff notes — yellow notepad block */}
        <div className="bg-yellow-50 dark:bg-yellow-950/30 border-t border-yellow-200 dark:border-yellow-900 px-5 lg:px-6 pt-3 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Staff Notes
            </span>
          </div>
          <ParkingNotesForm id={reservation.id} staffNotes={reservation.staff_notes} />
        </div>
      </section>

      {/* Status stepper */}
      <section className="pt-2">
        <SectionTitle num={nextNum()} title="Status" />
        <div className={`${TILE} overflow-hidden`}>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-stone-200 dark:divide-stone-800">
            {STEPPER.map((step, idx) => {
              const done = isTerminal ? idx <= currentIdx : idx < currentIdx;
              const current = !isTerminal && idx === currentIdx;
              return (
                <div
                  key={step.key}
                  className={`flex flex-col gap-1 px-4 py-3 ${current ? "bg-blue-50/70 dark:bg-blue-950/20" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-5 h-5 rounded-full grid place-items-center flex-none ${
                        done
                          ? "bg-emerald-600 text-white"
                          : current
                            ? "bg-blue-600 text-white"
                            : "bg-card border border-stone-200 dark:border-stone-700"
                      }`}
                    >
                      {done && <Check className="w-3 h-3" strokeWidth={3} />}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        done || current
                          ? "text-stone-900 dark:text-stone-50"
                          : "text-stone-500 dark:text-stone-500"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  <div className="ml-7 text-[11px] font-mono tabular-nums text-stone-500 dark:text-stone-400">
                    {step.ts ? formatTimestamp(step.ts) : current ? "Current" : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Service interests */}
      <section className="pt-2">
        <SectionTitle num={nextNum()} title="Service interests" />
        <div className={`${TILE} px-4 py-4`}>
          <ParkingServicesForm
            id={reservation.id}
            services={reservation.services_interested ?? []}
            completed={reservation.services_completed ?? []}
          />
        </div>
      </section>

      {/* Key Pickup (conditional) */}
      {reservation.status === "checked_out" && (
        <section className="pt-2">
          <SectionTitle num={nextNum()} title="Key pickup" />
          <div className={`${TILE} px-4 py-4`}>
            {reservation.lock_box_number ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 shrink-0 text-stone-400" />
                  <span className={SECTION_LABEL}>Lock box</span>
                  <span className="font-mono tabular-nums font-semibold text-stone-900 dark:text-stone-50">
                    #{reservation.lock_box_number}
                  </span>
                </div>
                {lockBoxCode && (
                  <div className="flex items-center gap-2">
                    <span className={SECTION_LABEL}>Code</span>
                    <span className="font-mono tabular-nums font-semibold text-stone-900 dark:text-stone-50">
                      {lockBoxCode}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <KeyRound className="h-4 w-4 shrink-0 text-stone-400" />
                <span className="text-stone-700 dark:text-stone-300">In person pickup</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Valet assignments (conditional) */}
      {reservation.parking_type === "valet" && (
        <section className="pt-2">
          <SectionTitle num={nextNum()} title="Valet assignments" />
          <div className={`${TILE} px-4 py-4`}>
            <ParkingValetForm
              id={reservation.id}
              arrivalValet={reservation.arrival_valet}
              departureValet={reservation.departure_valet}
            />
          </div>
        </section>
      )}

      {/* Invoices */}
      <section className="pt-2">
        <SectionTitle num={nextNum()} title="Invoices" />
        <ParkingInvoiceSection
          reservationId={reservation.id}
          invoices={invoices}
          customerPhone={reservation.phone}
          customerEmail={reservation.email}
        />
      </section>
    </div>
  );
}
