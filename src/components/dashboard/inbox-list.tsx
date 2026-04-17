"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DollarSign, ClipboardCheck, FileText, FileQuestion, Car, Megaphone,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatVehicle, formatCurrency, formatDateShort } from "@/lib/utils/format";
import { PARKING_SERVICE_LABELS } from "@/lib/constants";
import type {
  InboxData,
  InboxUnpaidJob,
  InboxDvi,
  InboxEstimate,
  InboxQuote,
  InboxParkingLead,
  InboxParkingSpecials,
} from "@/lib/actions/inbox";

// ── Helpers ─────────────────────────────────────────────

function daysBetween(from: string | null, today: string): number {
  if (!from) return 0;
  const f = new Date(from + "T12:00:00");
  const t = new Date(today + "T12:00:00");
  return Math.max(0, Math.floor((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24)));
}

function DaysBadge({ days, warnAt = 3 }: { days: number; warnAt?: number }) {
  return (
    <span className={cn(
      "text-[10px] font-black px-2 py-1 rounded-full uppercase whitespace-nowrap",
      days >= warnAt
        ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400"
        : "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400"
    )}>
      {days}d
    </span>
  );
}

// ── Filter tabs ─────────────────────────────────────────

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

// ── Section wrapper ─────────────────────────────────────

function Section({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="bg-card rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center gap-2.5 bg-stone-800 dark:bg-stone-900 px-5 py-3">
        <Icon className="h-3.5 w-3.5 text-stone-400" />
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-stone-100">{title}</h3>
        <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full bg-stone-600 text-stone-100">
          {count}
        </span>
      </div>
      <div className="divide-y divide-stone-200 dark:divide-stone-800">
        {children}
      </div>
    </div>
  );
}

// ── Item rows ───────────────────────────────────────────

function UnpaidJobRow({ job, today }: { job: InboxUnpaidJob; today: string }) {
  const customer = job.customers;
  const vehicle = job.vehicles;
  const days = daysBetween(job.date_finished, today);
  return (
    <Link href={`/jobs/${job.id}`} className="block">
      <div className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate text-stone-900 dark:text-stone-50">
            {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
            {vehicle ? formatVehicle(vehicle) : ""}{job.title ? ` · ${job.title}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 pl-3">
          <span className="text-sm font-bold tabular-nums text-stone-900 dark:text-stone-50">
            {formatCurrency(job.total)}
          </span>
          <DaysBadge days={days} />
        </div>
      </div>
    </Link>
  );
}

function DviReadyRow({ dvi, today }: { dvi: InboxDvi; today: string }) {
  const job = dvi.jobs;
  const customer = job?.customers;
  const vehicle = job?.vehicles;
  const days = daysBetween(dvi.completed_at?.split("T")[0] ?? null, today);
  const href = job ? `/jobs/${job.id}` : `/dvi/inspect/${dvi.id}`;
  return (
    <Link href={href} className="block">
      <div className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate text-stone-900 dark:text-stone-50">
            {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
            {vehicle ? formatVehicle(vehicle) : job?.title || "DVI"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-3">
          {dvi.attention > 0 && (
            <span className="text-[10px] font-black px-2 py-1 rounded-full uppercase bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400">
              {dvi.attention} attn
            </span>
          )}
          {dvi.monitor > 0 && (
            <span className="text-[10px] font-black px-2 py-1 rounded-full uppercase bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
              {dvi.monitor} mon
            </span>
          )}
          <DaysBadge days={days} warnAt={1} />
        </div>
      </div>
    </Link>
  );
}

function EstimateRow({ estimate, today }: { estimate: InboxEstimate; today: string }) {
  const job = estimate.jobs;
  const customer = job?.customers;
  const vehicle = job?.vehicles;
  const days = daysBetween(estimate.sent_at?.split("T")[0] ?? null, today);
  return (
    <Link href={job ? `/jobs/${job.id}` : "#"} className="block">
      <div className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate text-stone-900 dark:text-stone-50">
            {customer ? `${customer.first_name} ${customer.last_name}` : "Unknown"}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
            {vehicle ? formatVehicle(vehicle) : job?.title || "Estimate"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 pl-3">
          <span className="text-sm font-bold tabular-nums text-stone-900 dark:text-stone-50">
            {formatCurrency(estimate.total)}
          </span>
          <DaysBadge days={days} />
        </div>
      </div>
    </Link>
  );
}

function QuoteRequestRow({ quote, today }: { quote: InboxQuote; today: string }) {
  const vehicle = formatVehicle({ year: quote.vehicle_year, make: quote.vehicle_make, model: quote.vehicle_model });
  const days = daysBetween(quote.created_at.split("T")[0], today);
  return (
    <Link href="/quote-requests?status=new" className="block">
      <div className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate text-stone-900 dark:text-stone-50">
            {quote.first_name} {quote.last_name}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
            {vehicle || "No vehicle"}{quote.services.length > 0 ? ` · ${quote.services.join(", ")}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-3">
          <DaysBadge days={days} />
        </div>
      </div>
    </Link>
  );
}

function ParkingLeadRow({ lead }: { lead: InboxParkingLead }) {
  const completed = new Set(lead.services_completed || []);
  const pending = lead.services_interested.filter((s) => !completed.has(s));
  return (
    <Link href={`/parking/${lead.id}`} className="block">
      <div className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate text-stone-900 dark:text-stone-50">
            {lead.first_name} {lead.last_name}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
            {[lead.make, lead.model].filter(Boolean).join(" ") || "Vehicle"} · {lead.lot} · {formatDateShort(lead.drop_off_date)} – {formatDateShort(lead.pick_up_date)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pl-3 flex-wrap justify-end">
          {pending.map((s) => (
            <span key={s} className="text-[10px] font-black px-2 py-1 rounded-full uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
              {PARKING_SERVICE_LABELS[s] || s}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

function ParkingSpecialsRow({ reservation }: { reservation: InboxParkingSpecials }) {
  return (
    <Link href={`/parking/${reservation.id}`} className="block">
      <div className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate text-stone-900 dark:text-stone-50">
            {reservation.first_name} {reservation.last_name}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
            {[reservation.make, reservation.model].filter(Boolean).join(" ") || "Vehicle"} · {reservation.lot}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-3">
          <span className="text-[10px] font-black px-2 py-1 rounded-full uppercase bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
            Specials not sent
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Main component ──────────────────────────────────────

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
      <div className="bg-card rounded-xl shadow-card p-12 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
        <p className="mt-3 text-sm font-semibold text-stone-500 dark:text-stone-400">All caught up</p>
        <p className="text-xs text-muted-foreground mt-1">No action items right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => {
          const count = tabCount(data, t.key);
          if (t.key !== "all" && count === 0) return null;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                tab === t.key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
              )}
            >
              {t.label}
              {count > 0 && (
                <span className={cn(
                  "ml-1.5 tabular-nums",
                  tab === t.key ? "text-blue-200" : "text-stone-400 dark:text-stone-500"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {showPayments && (
        <Section title="Unpaid Jobs" icon={DollarSign} count={data.unpaidJobs.length}>
          {data.unpaidJobs.map((job) => (
            <UnpaidJobRow key={job.id} job={job} today={data.today} />
          ))}
        </Section>
      )}

      {showDvi && (
        <Section title="DVIs Ready to Send" icon={ClipboardCheck} count={data.dvisReady.length}>
          {data.dvisReady.map((dvi) => (
            <DviReadyRow key={dvi.id} dvi={dvi} today={data.today} />
          ))}
        </Section>
      )}

      {showEstimates && (
        <Section title="Pending Estimates" icon={FileText} count={data.pendingEstimates.length}>
          {data.pendingEstimates.map((est) => (
            <EstimateRow key={est.id} estimate={est} today={data.today} />
          ))}
        </Section>
      )}

      {showQuotes && (
        <Section title="New Quote Requests" icon={FileQuestion} count={data.quoteRequests.length}>
          {data.quoteRequests.map((q) => (
            <QuoteRequestRow key={q.id} quote={q} today={data.today} />
          ))}
        </Section>
      )}

      {showParking && (
        <>
          <Section title="Parking Service Leads" icon={Car} count={data.parkingServiceLeads.length}>
            {data.parkingServiceLeads.map((lead) => (
              <ParkingLeadRow key={lead.id} lead={lead} />
            ))}
          </Section>
          <Section title="Parking Specials Not Sent" icon={Megaphone} count={data.parkingSpecialsNotSent.length}>
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
