"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DollarSign, ClipboardCheck, FileText, FileQuestion, Car, Megaphone,
  CheckCircle2,
} from "lucide-react";
import { cn, daysBetween } from "@/lib/utils";
import {
  formatVehicle, formatCurrencyWhole, formatCustomerName, formatDateShort,
} from "@/lib/utils/format";
import { PARKING_SERVICE_LABELS } from "@/lib/constants";
import { COLUMN_HEADER } from "@/components/ui/section-card";
import { ACCENT_ICON_TINT, type Accent } from "@/components/ui/mini-status-card";
import { CustomerLink } from "@/components/ui/customer-link";
import { ClickableRow } from "@/components/ui/clickable-row";
import type {
  InboxData,
  InboxUnpaidJob,
  InboxDvi,
  InboxEstimate,
  InboxQuote,
  InboxParkingLead,
  InboxParkingSpecials,
} from "@/lib/actions/inbox";

function DaysBadge({ days, warnAt = 3 }: { days: number; warnAt?: number }) {
  const cls = days >= 7
    ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
    : days >= warnAt
      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400"
      : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400";
  return (
    <span className={cn(
      "inline-flex items-center font-mono tabular-nums px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap",
      cls,
    )}>
      {days}d
    </span>
  );
}

const TABS = [
  { key: "all", label: "All" },
  { key: "payments", label: "Payments" },
  { key: "dvi", label: "DVIs" },
  { key: "estimates", label: "Estimates" },
  { key: "quotes", label: "Quotes" },
  { key: "parking", label: "Parking" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function tabCount(data: InboxData, tab: TabKey): number {
  if (tab === "all") return data.counts.total;
  if (tab === "payments") return data.counts.unpaid;
  if (tab === "dvi") return data.counts.dvi;
  if (tab === "estimates") return data.counts.estimates;
  if (tab === "quotes") return data.counts.quotes;
  if (tab === "parking") return data.counts.parkingLeads + data.counts.parkingSpecials;
  return 0;
}

function Section({
  title,
  icon: Icon,
  count,
  accent,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  accent: Accent;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 bg-sidebar border-b border-stone-200 dark:border-stone-800 px-4 py-2">
        <div className={cn(
          "w-6 h-6 rounded grid place-items-center border flex-none",
          ACCENT_ICON_TINT[accent],
        )}>
          <Icon className="h-3 w-3" />
        </div>
        <span className={COLUMN_HEADER}>{title}</span>
        <span className="ml-auto font-mono tabular-nums text-[11px] font-medium text-stone-500 dark:text-stone-400">
          {count}
        </span>
      </div>
      <div className="divide-y divide-stone-100 dark:divide-stone-800/60">
        {children}
      </div>
    </div>
  );
}

function UnpaidJobRow({ job, today }: { job: InboxUnpaidJob; today: string }) {
  const customer = job.customers;
  const vehicle = job.vehicles;
  const days = daysBetween(job.date_finished, today);
  return (
    <ClickableRow
      href={`/jobs/${job.id}`}
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-stone-900 dark:text-stone-50">
          {customer ? (
            <CustomerLink customerId={customer.id} stopPropagation>
              {formatCustomerName(customer)}
            </CustomerLink>
          ) : "Unknown"}
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
          {vehicle ? formatVehicle(vehicle) : ""}{job.title ? ` · ${job.title}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono tabular-nums text-sm font-medium text-stone-900 dark:text-stone-50">
          {formatCurrencyWhole(job.total)}
        </span>
        <DaysBadge days={days} />
      </div>
    </ClickableRow>
  );
}

function DviReadyRow({ dvi, today }: { dvi: InboxDvi; today: string }) {
  const job = dvi.jobs;
  const customer = job?.customers || dvi.customers;
  const vehicle = job?.vehicles || dvi.vehicles;
  const days = daysBetween(dvi.completed_at?.split("T")[0] ?? null, today);
  const href = job ? `/jobs/${job.id}` : `/dvi/inspect/${dvi.id}`;
  return (
    <ClickableRow
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-stone-900 dark:text-stone-50">
          {customer ? (
            <CustomerLink customerId={customer.id} stopPropagation>
              {formatCustomerName(customer)}
            </CustomerLink>
          ) : "Unknown"}
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
          {vehicle ? formatVehicle(vehicle) : job?.title || "DVI"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {dvi.attention > 0 && (
          <span className="inline-flex items-center font-mono tabular-nums px-1.5 py-0.5 rounded text-[11px] font-medium bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
            {dvi.attention} attn
          </span>
        )}
        {dvi.monitor > 0 && (
          <span className="inline-flex items-center font-mono tabular-nums px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400">
            {dvi.monitor} mon
          </span>
        )}
        <DaysBadge days={days} warnAt={1} />
      </div>
    </ClickableRow>
  );
}

function EstimateRow({ estimate, today }: { estimate: InboxEstimate; today: string }) {
  const job = estimate.jobs;
  const customer = job?.customers;
  const vehicle = job?.vehicles;
  const days = daysBetween(estimate.sent_at?.split("T")[0] ?? null, today);
  const href = job ? `/jobs/${job.id}` : "#";
  return (
    <ClickableRow
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-stone-900 dark:text-stone-50">
          {customer ? (
            <CustomerLink customerId={customer.id} stopPropagation>
              {formatCustomerName(customer)}
            </CustomerLink>
          ) : "Unknown"}
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
          {vehicle ? formatVehicle(vehicle) : job?.title || "Estimate"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono tabular-nums text-sm font-medium text-stone-900 dark:text-stone-50">
          {formatCurrencyWhole(estimate.total)}
        </span>
        <DaysBadge days={days} />
      </div>
    </ClickableRow>
  );
}

function QuoteRequestRow({ quote, today }: { quote: InboxQuote; today: string }) {
  const vehicle = formatVehicle({ year: quote.vehicle_year, make: quote.vehicle_make, model: quote.vehicle_model });
  const days = daysBetween(quote.created_at.split("T")[0], today);
  return (
    <Link
      href="/quote-requests?status=new"
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-stone-900 dark:text-stone-50">
          {formatCustomerName(quote)}
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
          {vehicle || "No vehicle"}{quote.services.length > 0 ? ` · ${quote.services.join(", ")}` : ""}
        </p>
      </div>
      <DaysBadge days={days} />
    </Link>
  );
}

function ParkingLeadRow({ lead }: { lead: InboxParkingLead }) {
  const completed = new Set(lead.services_completed || []);
  const pending = lead.services_interested.filter((s) => !completed.has(s));
  return (
    <ClickableRow
      href={`/parking/${lead.id}`}
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-stone-900 dark:text-stone-50">
          <CustomerLink customerId={lead.customer_id} stopPropagation>
            {formatCustomerName(lead)}
          </CustomerLink>
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
          {[lead.make, lead.model].filter(Boolean).join(" ") || "Vehicle"} · {lead.lot} · <span className="font-mono tabular-nums">{formatDateShort(lead.drop_off_date)}–{formatDateShort(lead.pick_up_date)}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 flex-wrap justify-end max-w-[180px]">
        {pending.map((s) => (
          <span
            key={s}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
          >
            {PARKING_SERVICE_LABELS[s] || s}
          </span>
        ))}
      </div>
    </ClickableRow>
  );
}

function ParkingSpecialsRow({ reservation }: { reservation: InboxParkingSpecials }) {
  return (
    <ClickableRow
      href={`/parking/${reservation.id}`}
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-stone-900 dark:text-stone-50">
          <CustomerLink customerId={reservation.customer_id} stopPropagation>
            {formatCustomerName(reservation)}
          </CustomerLink>
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
          {[reservation.make, reservation.model].filter(Boolean).join(" ") || "Vehicle"} · {reservation.lot}
        </p>
      </div>
      <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400">
        Specials not sent
      </span>
    </ClickableRow>
  );
}

export function InboxList({ data, activeTab }: { data: InboxData; activeTab: string }) {
  const router = useRouter();
  const tab = (TABS.some((t) => t.key === activeTab) ? activeTab : "all") as TabKey;

  function setTab(t: TabKey) {
    router.push(t === "all" ? "/inbox" : `/inbox?tab=${t}`);
  }

  const showPayments = tab === "all" || tab === "payments";
  const showDvi = tab === "all" || tab === "dvi";
  const showEstimates = tab === "all" || tab === "estimates";
  const showQuotes = tab === "all" || tab === "quotes";
  const showParking = tab === "all" || tab === "parking";

  if (data.counts.total === 0) {
    return (
      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm py-12 text-center">
        <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 mx-auto" />
        <p className="mt-2 text-sm font-medium text-stone-500 dark:text-stone-400">All caught up</p>
        <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">No action items right now</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Segmented filter */}
      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-stone-100 dark:bg-stone-800">
        {TABS.map((t) => {
          const count = tabCount(data, t.key);
          if (t.key !== "all" && count === 0) return null;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium transition-colors",
                active
                  ? "bg-card text-stone-900 dark:text-stone-50 shadow-sm"
                  : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200",
              )}
            >
              {t.label}
              {count > 0 && (
                <span className={cn(
                  "font-mono tabular-nums",
                  active ? "text-stone-500 dark:text-stone-400" : "text-stone-400 dark:text-stone-500",
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {showPayments && (
          <Section title="Unpaid jobs" icon={DollarSign} accent="red" count={data.unpaidJobs.length}>
            {data.unpaidJobs.map((job) => (
              <UnpaidJobRow key={job.id} job={job} today={data.today} />
            ))}
          </Section>
        )}

        {showDvi && (
          <Section title="DVIs ready to send" icon={ClipboardCheck} accent="blue" count={data.dvisReady.length}>
            {data.dvisReady.map((dvi) => (
              <DviReadyRow key={dvi.id} dvi={dvi} today={data.today} />
            ))}
          </Section>
        )}

        {showEstimates && (
          <Section title="Pending estimates" icon={FileText} accent="amber" count={data.pendingEstimates.length}>
            {data.pendingEstimates.map((est) => (
              <EstimateRow key={est.id} estimate={est} today={data.today} />
            ))}
          </Section>
        )}

        {showQuotes && (
          <Section title="New quote requests" icon={FileQuestion} accent="blue" count={data.quoteRequests.length}>
            {data.quoteRequests.map((q) => (
              <QuoteRequestRow key={q.id} quote={q} today={data.today} />
            ))}
          </Section>
        )}

        {showParking && (
          <>
            <Section title="Parking service leads" icon={Car} accent="indigo" count={data.parkingServiceLeads.length}>
              {data.parkingServiceLeads.map((lead) => (
                <ParkingLeadRow key={lead.id} lead={lead} />
              ))}
            </Section>
            <Section title="Parking specials not sent" icon={Megaphone} accent="amber" count={data.parkingSpecialsNotSent.length}>
              {data.parkingSpecialsNotSent.map((r) => (
                <ParkingSpecialsRow key={r.id} reservation={r} />
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
