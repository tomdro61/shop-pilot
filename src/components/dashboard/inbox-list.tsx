"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Inbox as InboxIcon,
  UserX,
  MessageSquareQuote,
  FileText,
  ClipboardCheck,
  MapPin,
  Megaphone,
  Package,
  DollarSign,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { cn, daysBetween } from "@/lib/utils";
import {
  formatVehicle,
  formatCurrencyWhole,
  formatCustomerName,
  formatDateShort,
} from "@/lib/utils/format";
import { PARKING_SERVICE_LABELS } from "@/lib/constants";
import { CustomerLink } from "@/components/ui/customer-link";
import { ClickableRow } from "@/components/ui/clickable-row";
import { TONE_CLASSES, type Tone } from "@/lib/ui/alert-tone";
import type {
  InboxData,
  InboxUnassignedJob,
  InboxAgedPart,
  InboxUnpaidJob,
  InboxDvi,
  InboxEstimate,
  InboxQuote,
  InboxParkingLead,
  InboxParkingSpecials,
} from "@/lib/actions/inbox";

// ─── Tabs ────────────────────────────────────────────────────────

interface TabSpec {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  tone: Tone;
}

const TABS: readonly TabSpec[] = [
  { key: "unassigned", label: "Unassigned", icon: UserX, tone: "amber" },
  { key: "quotes", label: "Quotes", icon: MessageSquareQuote, tone: "blue" },
  { key: "estimates", label: "Estimates", icon: FileText, tone: "indigo" },
  { key: "dvi", label: "DVIs", icon: ClipboardCheck, tone: "violet" },
  { key: "parking", label: "Parking", icon: MapPin, tone: "emerald" },
  { key: "parts", label: "Parts", icon: Package, tone: "red" },
  { key: "payments", label: "Payments", icon: DollarSign, tone: "red" },
];

type TabKey =
  | "unassigned"
  | "quotes"
  | "estimates"
  | "dvi"
  | "parking"
  | "parts"
  | "payments";

function isTabKey(value: string): value is TabKey {
  return TABS.some((t) => t.key === value);
}

function tabCount(data: InboxData, tab: TabKey): number {
  switch (tab) {
    case "unassigned":
      return data.counts.unassigned;
    case "quotes":
      return data.counts.quotes;
    case "estimates":
      return data.counts.estimates;
    case "dvi":
      return data.counts.dvi;
    case "parking":
      return data.counts.parkingLeads + data.counts.parkingSpecials;
    case "parts":
      return data.counts.parts;
    case "payments":
      return data.counts.unpaid;
  }
}

// ─── Days badge ──────────────────────────────────────────────────

function DaysBadge({ days, warnAt = 3 }: { days: number; warnAt?: number }) {
  const cls =
    days >= 7
      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
      : days >= warnAt
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400"
        : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400";
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono tabular-nums px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap",
        cls
      )}
    >
      {days}d
    </span>
  );
}

// ─── Section card ────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  count,
  tone,
  children,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  tone: Tone;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={cn(
              "w-7 h-7 rounded-md grid place-items-center border flex-none",
              TONE_CLASSES[tone].tile
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold tracking-tight text-stone-900 dark:text-stone-50 truncate">
            {title}
          </h3>
          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 tabular-nums">
            {count}
          </span>
        </div>
      </header>
      <ul className="divide-y divide-stone-200 dark:divide-stone-800">{children}</ul>
    </div>
  );
}

// ─── Row variants ────────────────────────────────────────────────

function UnassignedJobRow({ job, today }: { job: InboxUnassignedJob; today: string }) {
  const days = daysBetween(job.date_received, today);
  const customer = job.customers;
  const vehicle = job.vehicles;
  const statusLabel =
    job.status === "not_started"
      ? "Not started"
      : job.status === "waiting_for_parts"
        ? "Waiting on parts"
        : "In progress";
  return (
    <ClickableRow
      href={`/jobs/${job.id}`}
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-stone-900 dark:text-stone-50">
          {customer ? (
            <CustomerLink customerId={customer.id} stopPropagation>
              {formatCustomerName(customer)}
            </CustomerLink>
          ) : (
            "Unknown"
          )}
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
          {vehicle ? formatVehicle(vehicle) : ""}
          {job.title ? ` · ${job.title}` : ""}
          <span className="text-stone-400 dark:text-stone-500"> · {statusLabel}</span>
        </p>
      </div>
      <DaysBadge days={days} />
    </ClickableRow>
  );
}

function QuoteRequestRow({ quote, today }: { quote: InboxQuote; today: string }) {
  const vehicle = formatVehicle({
    year: quote.vehicle_year,
    make: quote.vehicle_make,
    model: quote.vehicle_model,
  });
  const days = daysBetween(quote.created_at.split("T")[0], today);
  return (
    <Link
      href="/quote-requests?status=new"
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-stone-900 dark:text-stone-50">
          {formatCustomerName(quote)}
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
          {vehicle || "No vehicle"}
          {quote.services.length > 0 ? ` · ${quote.services.join(", ")}` : ""}
        </p>
      </div>
      <DaysBadge days={days} />
    </Link>
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
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-stone-900 dark:text-stone-50">
          {customer ? (
            <CustomerLink customerId={customer.id} stopPropagation>
              {formatCustomerName(customer)}
            </CustomerLink>
          ) : (
            "Unknown"
          )}
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

function DviReadyRow({ dvi, today }: { dvi: InboxDvi; today: string }) {
  const job = dvi.jobs;
  const customer = job?.customers || dvi.customers;
  const vehicle = job?.vehicles || dvi.vehicles;
  const days = daysBetween(dvi.completed_at?.split("T")[0] ?? null, today);
  const href = job ? `/jobs/${job.id}` : `/dvi/inspect/${dvi.id}`;
  return (
    <ClickableRow
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-stone-900 dark:text-stone-50">
          {customer ? (
            <CustomerLink customerId={customer.id} stopPropagation>
              {formatCustomerName(customer)}
            </CustomerLink>
          ) : (
            "Unknown"
          )}
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

function ParkingLeadRow({ lead }: { lead: InboxParkingLead }) {
  const completed = new Set(lead.services_completed || []);
  const pending = lead.services_interested.filter((s) => !completed.has(s));
  return (
    <ClickableRow
      href={`/parking/${lead.id}`}
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-stone-900 dark:text-stone-50">
          <CustomerLink customerId={lead.customer_id} stopPropagation>
            {formatCustomerName(lead)}
          </CustomerLink>
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
          {[lead.make, lead.model].filter(Boolean).join(" ") || "Vehicle"} · {lead.lot} ·{" "}
          <span className="font-mono tabular-nums">
            {formatDateShort(lead.drop_off_date)}–{formatDateShort(lead.pick_up_date)}
          </span>
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
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-stone-900 dark:text-stone-50">
          <CustomerLink customerId={reservation.customer_id} stopPropagation>
            {formatCustomerName(reservation)}
          </CustomerLink>
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
          {[reservation.make, reservation.model].filter(Boolean).join(" ") || "Vehicle"} ·{" "}
          {reservation.lot}
        </p>
      </div>
      <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400">
        Specials not sent
      </span>
    </ClickableRow>
  );
}

function AgedPartsRow({ job, today }: { job: InboxAgedPart; today: string }) {
  const days = daysBetween(job.date_received, today);
  const customer = job.customers;
  const vehicle = job.vehicles;
  return (
    <ClickableRow
      href={`/jobs/${job.id}`}
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-stone-900 dark:text-stone-50">
          {customer ? (
            <CustomerLink customerId={customer.id} stopPropagation>
              {formatCustomerName(customer)}
            </CustomerLink>
          ) : (
            "Unknown"
          )}
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
          {vehicle ? formatVehicle(vehicle) : ""}
          {job.title ? ` · ${job.title}` : ""}
        </p>
      </div>
      <DaysBadge days={days} />
    </ClickableRow>
  );
}

function UnpaidJobRow({ job, today }: { job: InboxUnpaidJob; today: string }) {
  const customer = job.customers;
  const vehicle = job.vehicles;
  const days = daysBetween(job.date_finished, today);
  return (
    <ClickableRow
      href={`/jobs/${job.id}`}
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-stone-900 dark:text-stone-50">
          {customer ? (
            <CustomerLink customerId={customer.id} stopPropagation>
              {formatCustomerName(customer)}
            </CustomerLink>
          ) : (
            "Unknown"
          )}
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
          {vehicle ? formatVehicle(vehicle) : ""}
          {job.title ? ` · ${job.title}` : ""}
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

// ─── Main view ───────────────────────────────────────────────────

export function InboxList({ data, activeTab }: { data: InboxData; activeTab: string }) {
  const router = useRouter();
  const tab: TabKey | "all" = isTabKey(activeTab) ? activeTab : "all";

  function setTab(t: TabKey | "all") {
    router.push(t === "all" ? "/inbox" : `/inbox?tab=${t}`);
  }

  const showSection = (key: TabKey) => tab === "all" || tab === key;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-md grid place-items-center border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900 flex-none">
            <InboxIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
              Inbox
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {data.counts.total === 0
                ? "All caught up"
                : `${data.counts.total} item${data.counts.total === 1 ? "" : "s"} need attention`}
            </p>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label="All"
          count={data.counts.total}
          active={tab === "all"}
          onClick={() => setTab("all")}
        />
        {TABS.map((t) => {
          const count = tabCount(data, t.key);
          if (count === 0 && tab !== t.key) return null;
          return (
            <FilterChip
              key={t.key}
              label={t.label}
              icon={t.icon}
              tone={t.tone}
              count={count}
              active={tab === t.key}
              onClick={() => setTab(t.key)}
            />
          );
        })}
      </div>

      {/* Empty state */}
      {data.counts.total === 0 ? (
        <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card py-16 text-center">
          <div className="mx-auto w-10 h-10 rounded-full grid place-items-center bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-stone-700 dark:text-stone-200">
            All caught up
          </p>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Nothing in the queue right now.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {showSection("unassigned") && (
            <Section
              title="Unassigned jobs"
              icon={UserX}
              tone="amber"
              count={data.unassignedJobs.length}
            >
              {data.unassignedJobs.map((j) => (
                <UnassignedJobRow key={j.id} job={j} today={data.today} />
              ))}
            </Section>
          )}

          {showSection("quotes") && (
            <Section
              title="Quote requests"
              icon={MessageSquareQuote}
              tone="blue"
              count={data.quoteRequests.length}
            >
              {data.quoteRequests.map((q) => (
                <QuoteRequestRow key={q.id} quote={q} today={data.today} />
              ))}
            </Section>
          )}

          {showSection("estimates") && (
            <Section
              title="Estimates sent"
              icon={FileText}
              tone="indigo"
              count={data.pendingEstimates.length}
            >
              {data.pendingEstimates.map((e) => (
                <EstimateRow key={e.id} estimate={e} today={data.today} />
              ))}
            </Section>
          )}

          {showSection("dvi") && (
            <Section
              title="DVIs ready to send"
              icon={ClipboardCheck}
              tone="violet"
              count={data.dvisReady.length}
            >
              {data.dvisReady.map((dvi) => (
                <DviReadyRow key={dvi.id} dvi={dvi} today={data.today} />
              ))}
            </Section>
          )}

          {showSection("parking") && (
            <>
              <Section
                title="Parking service leads"
                icon={MapPin}
                tone="emerald"
                count={data.parkingServiceLeads.length}
              >
                {data.parkingServiceLeads.map((lead) => (
                  <ParkingLeadRow key={lead.id} lead={lead} />
                ))}
              </Section>
              <Section
                title="Parking specials not sent"
                icon={Megaphone}
                tone="emerald"
                count={data.parkingSpecialsNotSent.length}
              >
                {data.parkingSpecialsNotSent.map((r) => (
                  <ParkingSpecialsRow key={r.id} reservation={r} />
                ))}
              </Section>
            </>
          )}

          {showSection("parts") && (
            <Section title="Aged parts" icon={Package} tone="red" count={data.agedParts.length}>
              {data.agedParts.map((j) => (
                <AgedPartsRow key={j.id} job={j} today={data.today} />
              ))}
            </Section>
          )}

          {showSection("payments") && (
            <Section
              title="Awaiting payment"
              icon={DollarSign}
              tone="red"
              count={data.unpaidJobs.length}
            >
              {data.unpaidJobs.map((job) => (
                <UnpaidJobRow key={job.id} job={job} today={data.today} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  icon: Icon,
  tone,
  count,
  active,
  onClick,
}: {
  label: string;
  icon?: LucideIcon;
  tone?: Tone;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const activeClasses = tone
    ? TONE_CLASSES[tone].chip
    : "bg-stone-100 border-stone-300 text-stone-900 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-50";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-sm font-medium transition-colors",
        active
          ? activeClasses
          : "bg-card border-stone-200 text-stone-600 hover:bg-stone-50 dark:bg-stone-900 dark:border-stone-800 dark:text-stone-400 dark:hover:bg-stone-800/60"
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span>{label}</span>
      {count > 0 && (
        <span className="font-mono tabular-nums text-xs text-stone-500 dark:text-stone-400">
          {count}
        </span>
      )}
    </button>
  );
}
