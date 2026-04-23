import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import {
  Plus, Wallet, TrendingUp, TrendingDown, ChevronRight,
  DollarSign, Send, ClipboardCheck, FileText, Car,
} from "lucide-react";
import { INSPECTION_RATE_STATE, INSPECTION_RATE_TNC } from "@/lib/constants";
import { formatVehicle, formatCurrencyWhole, formatCustomerName } from "@/lib/utils/format";
import { todayET } from "@/lib/utils";
import { sumJobRevenue } from "@/lib/utils/revenue";
import { resolveDateRange } from "@/lib/utils/date-range";
import { SECTION_LABEL } from "@/components/ui/section-card";
import { SectionTitle } from "@/components/ui/section-title";
import { ClickableRow } from "@/components/ui/clickable-row";
import { CustomerLink } from "@/components/ui/customer-link";

export const metadata = {
  title: "Dashboard | ShopPilot",
};

function daysBetween(from: string | null, today: string): number {
  if (!from) return 0;
  const f = new Date(from + "T12:00:00");
  const t = new Date(today + "T12:00:00");
  return Math.max(0, Math.floor((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24)));
}

const getDashboardData = unstable_cache(async () => {
  const supabase = createAdminClient();
  const today = todayET();

  const week = resolveDateRange("this_week");
  const month = resolveDateRange("this_month");
  const weekStart = week.from;
  const weekEnd = week.to;
  const lastWeekStart = week.priorFrom!;
  const lastWeekEnd = week.priorTo!;
  const monthStart = month.from;
  const monthEnd = month.to;
  const lastMonthStart = month.priorFrom!;
  const lastMonthEnd = month.priorTo!;
  const inspectionRangeStart = [lastWeekStart, lastMonthStart, monthStart].sort()[0];

  const [
    activeJobsResult,
    monthCompletedResult,
    lastWeekCompletedResult,
    lastMonthCompletedResult,
    inspectionRangeResult,
    newQuoteCountResult,
    unpaidJobsResult,
    pendingEstimatesResult,
    dviReadyResult,
    parkingLeadCountResult,
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, status, title, assigned_tech, date_received, users!jobs_assigned_tech_fkey(name), customers(id, first_name, last_name), vehicles(year, make, model)")
      .in("status", ["not_started", "in_progress", "waiting_for_parts"]),
    supabase
      .from("jobs")
      .select("id, date_finished, payment_status, job_line_items(total, category)")
      .eq("status", "complete")
      .gte("date_finished", monthStart)
      .lte("date_finished", monthEnd),
    supabase
      .from("jobs")
      .select("id, job_line_items(total, category)")
      .eq("status", "complete")
      .gte("date_finished", lastWeekStart)
      .lte("date_finished", lastWeekEnd),
    supabase
      .from("jobs")
      .select("id, job_line_items(total, category)")
      .eq("status", "complete")
      .gte("date_finished", lastMonthStart)
      .lte("date_finished", lastMonthEnd),
    supabase
      .from("daily_inspection_counts")
      .select("date, state_count, tnc_count")
      .gte("date", inspectionRangeStart)
      .lte("date", monthEnd),
    supabase
      .from("quote_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    supabase
      .from("jobs")
      .select("id, title, date_finished, customers(id, first_name, last_name), vehicles(year, make, model), job_line_items(total)")
      .eq("status", "complete")
      .neq("payment_status", "paid")
      .neq("payment_status", "waived")
      .order("date_finished", { ascending: true }),
    supabase
      .from("estimates")
      .select("id, sent_at, jobs(id, title, customers(id, first_name, last_name), vehicles(year, make, model)), estimate_line_items(total)")
      .eq("status", "sent")
      .order("sent_at", { ascending: true }),
    supabase
      .from("dvi_inspections")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed"),
    supabase
      .from("parking_reservations")
      .select("id", { count: "exact", head: true })
      .not("services_interested", "eq", "{}")
      .in("status", ["reserved", "checked_in"]),
  ]);

  const activeJobs = activeJobsResult.data || [];
  const monthCompleted = monthCompletedResult.data || [];

  const inProgress = activeJobs.filter(j => j.status === "in_progress");
  const waitingForParts = activeJobs.filter(j => j.status === "waiting_for_parts");
  const notStarted = activeJobs.filter(j => j.status === "not_started");
  const todayScheduled = notStarted.filter(j => j.date_received === today);

  const inspectionRows = inspectionRangeResult.data || [];
  function sumInspectionRev(rows: typeof inspectionRows) {
    return rows.reduce(
      (sum, r) => sum + (r.state_count || 0) * INSPECTION_RATE_STATE + (r.tnc_count || 0) * INSPECTION_RATE_TNC, 0
    );
  }
  function sumStateCounts(rows: typeof inspectionRows) {
    return rows.reduce((s, r) => s + (r.state_count || 0), 0);
  }
  function sumTncCounts(rows: typeof inspectionRows) {
    return rows.reduce((s, r) => s + (r.tnc_count || 0), 0);
  }

  const inspToday = inspectionRows.filter(r => r.date === today);
  const inspWeek = inspectionRows.filter(r => r.date >= weekStart && r.date <= weekEnd);
  const inspMonth = inspectionRows.filter(r => r.date >= monthStart && r.date <= monthEnd);
  const inspLastWeek = inspectionRows.filter(r => r.date >= lastWeekStart && r.date <= lastWeekEnd);
  const inspLastMonth = inspectionRows.filter(r => r.date >= lastMonthStart && r.date <= lastMonthEnd);

  const todayCompleted = monthCompleted.filter(j => j.date_finished === today);
  const weekCompleted = monthCompleted.filter(j =>
    j.date_finished !== null && j.date_finished >= weekStart && j.date_finished <= weekEnd
  );
  const weekJobRevenue = sumJobRevenue(weekCompleted);
  const weekJobCount = weekCompleted.length;

  const unpaidJobs = (unpaidJobsResult.data || []).map(j => ({
    ...j,
    total: (j.job_line_items as { total: number }[])?.reduce((s, li) => s + (li.total || 0), 0) || 0,
  }));
  const totalOutstanding = unpaidJobs.reduce((s, j) => s + j.total, 0);
  const oldestUnpaidDays = unpaidJobs[0]?.date_finished ? daysBetween(unpaidJobs[0].date_finished, today) : 0;

  const pendingEstimates = (pendingEstimatesResult.data || []).map(e => ({
    ...e,
    total: (e.estimate_line_items as { total: number }[])?.reduce((s, li) => s + (li.total || 0), 0) || 0,
  }));
  const estimateTotal = pendingEstimates.reduce((s, e) => s + e.total, 0);
  const oldestEstimateDays = pendingEstimates[0]?.sent_at
    ? daysBetween(pendingEstimates[0].sent_at.split("T")[0], today)
    : 0;

  return {
    stats: {
      todayRevenue: sumJobRevenue(todayCompleted) + sumInspectionRev(inspToday),
      weeklyRevenue: weekJobRevenue + sumInspectionRev(inspWeek),
      lastWeekRevenue: sumJobRevenue(lastWeekCompletedResult.data) + sumInspectionRev(inspLastWeek),
      monthlyRevenue: sumJobRevenue(monthCompleted) + sumInspectionRev(inspMonth),
      lastMonthRevenue: sumJobRevenue(lastMonthCompletedResult.data) + sumInspectionRev(inspLastMonth),
      avgTicketWeek: weekJobCount > 0 ? weekJobRevenue / weekJobCount : 0,
      weekTicketCount: weekJobCount,
      unpaidJobCount: unpaidJobs.length,
    },
    ops: {
      stateToday: sumStateCounts(inspToday),
      stateWeek: sumStateCounts(inspWeek),
      stateMonth: sumStateCounts(inspMonth),
      tncToday: sumTncCounts(inspToday),
      tncWeek: sumTncCounts(inspWeek),
      tncMonth: sumTncCounts(inspMonth),
      jobsClosedToday: todayCompleted.length,
      jobsClosedWeek: weekCompleted.length,
      jobsClosedMonth: monthCompleted.length,
    },
    shopFloor: {
      notStarted,
      waitingForParts,
      inProgress,
    },
    totalOutstanding,
    oldestUnpaidDays,
    pendingEstimateCount: pendingEstimates.length,
    estimateTotal,
    oldestEstimateDays,
    dviReadyCount: dviReadyResult.count || 0,
    newQuoteRequests: newQuoteCountResult.count || 0,
    parkingServiceLeadCount: parkingLeadCountResult.count || 0,
  };
}, ["dashboard-stats"], { revalidate: 30 });

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function KpiCard({
  label,
  value,
  changePct,
  sub,
  tone = "default",
}: {
  label: string;
  value: number;
  changePct?: number;
  sub?: string;
  tone?: "default" | "amber";
}) {
  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden px-4 py-3">
      <div className={SECTION_LABEL}>{label}</div>
      <div className={`font-mono tabular-nums text-[22px] lg:text-[26px] font-semibold leading-tight mt-1 ${
        tone === "amber" && value > 0 ? "text-amber-700 dark:text-amber-400" : "text-stone-900 dark:text-stone-50"
      }`}>
        {formatCurrencyWhole(value)}
      </div>
      <div className="mt-1 flex items-center gap-2">
        {typeof changePct === "number" && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
            changePct >= 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}>
            {changePct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {changePct >= 0 ? "+" : ""}{changePct.toFixed(0)}%
          </span>
        )}
        {sub && <span className="text-[11px] text-stone-500 dark:text-stone-400">{sub}</span>}
      </div>
    </div>
  );
}

function OpsCard({
  label,
  today,
  week,
  month,
}: {
  label: string;
  today: number;
  week: number;
  month: number;
}) {
  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-stone-100 dark:border-stone-800/60">
        <div className={SECTION_LABEL}>{label}</div>
        <div className="font-mono tabular-nums text-[20px] font-semibold text-stone-900 dark:text-stone-50 leading-tight mt-0.5">
          {today}
          <span className="text-xs text-stone-500 dark:text-stone-400 font-sans font-normal ml-1.5">today</span>
        </div>
      </div>
      <dl className="grid grid-cols-2 divide-x divide-stone-100 dark:divide-stone-800/60">
        <div className="px-4 py-2">
          <dt className={SECTION_LABEL}>Week</dt>
          <dd className="font-mono tabular-nums text-sm font-semibold text-stone-900 dark:text-stone-50">{week}</dd>
        </div>
        <div className="px-4 py-2">
          <dt className={SECTION_LABEL}>Month</dt>
          <dd className="font-mono tabular-nums text-sm font-semibold text-stone-900 dark:text-stone-50">{month}</dd>
        </div>
      </dl>
    </div>
  );
}

type ShopFloorJob = {
  id: string;
  status: string;
  title: string | null;
  date_received: string | null;
  customers: unknown;
  vehicles: unknown;
  users: unknown;
};

type ShopFloorStatus = "not_started" | "waiting_for_parts" | "in_progress";

const SHOP_FLOOR_CONFIG: Record<
  ShopFloorStatus,
  { label: string; dot: string; queryKey: string }
> = {
  not_started: { label: "Not started", dot: "bg-stone-400 dark:bg-stone-500", queryKey: "not_started" },
  waiting_for_parts: { label: "Waiting for parts", dot: "bg-amber-500", queryKey: "waiting_for_parts" },
  in_progress: { label: "In progress", dot: "bg-blue-500", queryKey: "in_progress" },
};

function agingBadgeClass(days: number): string {
  if (days >= 7) return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400";
  if (days >= 3) return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400";
  return "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400";
}

function ShopFloorColumn({
  status,
  jobs,
  today,
}: {
  status: ShopFloorStatus;
  jobs: ShopFloorJob[];
  today: string;
}) {
  const config = SHOP_FLOOR_CONFIG[status];
  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-100 dark:border-stone-800/60">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
          <span className={SECTION_LABEL}>{config.label}</span>
          <span className="font-mono tabular-nums text-[11px] text-stone-500 dark:text-stone-400">
            {jobs.length}
          </span>
        </div>
        <Link
          href={`/jobs?status=${config.queryKey}`}
          className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
        >
          View all
        </Link>
      </div>
      {jobs.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-stone-400 dark:text-stone-500">
          None
        </div>
      ) : (
        <div>
          {jobs.map((job) => {
            const customer = job.customers as { id: string; first_name: string; last_name: string } | null;
            const vehicle = job.vehicles as { year: number | null; make: string | null; model: string | null } | null;
            const days = daysBetween(job.date_received, today);
            return (
              <ClickableRow
                key={job.id}
                href={`/jobs/${job.id}`}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-stone-100 dark:border-stone-800/60 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-stone-900 dark:text-stone-50 truncate">
                    {customer ? (
                      <CustomerLink customerId={customer.id} stopPropagation>
                        {formatCustomerName(customer)}
                      </CustomerLink>
                    ) : "Unknown"}
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
                    {vehicle ? formatVehicle(vehicle) : "—"}
                    {job.title ? ` · ${job.title}` : ""}
                  </div>
                </div>
                <span
                  className={`shrink-0 font-mono tabular-nums text-[10px] font-semibold px-1.5 py-0.5 rounded ${agingBadgeClass(days)}`}
                >
                  {days}d
                </span>
              </ClickableRow>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ACTION_ACCENT: Record<"red" | "amber" | "blue" | "indigo", string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
};

const ACTION_ICON_TINT: Record<"red" | "amber" | "blue" | "indigo", string> = {
  red: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
  amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900",
};

function ActionRow({
  accent,
  icon,
  title,
  count,
  detail,
  href,
}: {
  accent: "red" | "amber" | "blue" | "indigo";
  icon: React.ReactNode;
  title: string;
  count: number;
  detail?: string;
  href: string;
}) {
  if (count === 0) {
    return (
      <div className="relative flex items-center gap-3 px-4 py-3 opacity-50">
        <span aria-hidden className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r bg-stone-200 dark:bg-stone-700`} />
        <div className={`w-9 h-9 rounded-md grid place-items-center border flex-none bg-stone-50 text-stone-400 border-stone-200 dark:bg-stone-900 dark:text-stone-600 dark:border-stone-800`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-stone-500 dark:text-stone-400">{title}</div>
          <div className="text-xs text-stone-400 dark:text-stone-500">All caught up</div>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group relative flex items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
    >
      <span aria-hidden className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r ${ACTION_ACCENT[accent]}`} />
      <div className={`w-9 h-9 rounded-md grid place-items-center border flex-none ${ACTION_ICON_TINT[accent]}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold text-stone-900 dark:text-stone-50">{title}</span>
          <span className="font-mono tabular-nums text-sm font-semibold text-stone-900 dark:text-stone-50">{count}</span>
        </div>
        {detail && <div className="text-xs text-stone-500 dark:text-stone-400 truncate">{detail}</div>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-stone-400 group-hover:text-stone-700 dark:group-hover:text-stone-200 transition-colors" />
    </Link>
  );
}

export default async function DashboardPage() {
  const {
    stats, ops, shopFloor,
    totalOutstanding, oldestUnpaidDays,
    pendingEstimateCount, estimateTotal, oldestEstimateDays,
    dviReadyCount, newQuoteRequests, parkingServiceLeadCount,
  } = await getDashboardData();
  const today = todayET();

  const weekChange = pctChange(stats.weeklyRevenue, stats.lastWeekRevenue);
  const monthChange = pctChange(stats.monthlyRevenue, stats.lastMonthRevenue);

  const actionItemCount =
    stats.unpaidJobCount +
    pendingEstimateCount +
    dviReadyCount +
    newQuoteRequests +
    parkingServiceLeadCount;

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 pb-12 space-y-5 lg:space-y-6">

      <div className="flex flex-wrap items-center justify-end gap-1.5 py-2">
        <Link href="/customers/new">
          <Button variant="ghost" size="sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Customer
          </Button>
        </Link>
        <Link href="/jobs/new">
          <Button size="sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Job
          </Button>
        </Link>
        <Link href="/quick-pay">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Wallet className="mr-1.5 h-3.5 w-3.5" />
            Quick Pay
          </Button>
        </Link>
      </div>

      <section className="pt-2">
        <SectionTitle
          num="01"
          title="Revenue & pacing"
          sub="this week · this month · avg ticket · outstanding"
        />
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="This week"
              value={stats.weeklyRevenue}
              changePct={weekChange}
              sub="vs last week"
            />
            <KpiCard
              label="This month"
              value={stats.monthlyRevenue}
              changePct={monthChange}
              sub="vs last month"
            />
            <KpiCard
              label="Avg ticket"
              value={stats.avgTicketWeek}
              sub={`${stats.weekTicketCount} tickets this week`}
            />
            <KpiCard
              label="Outstanding A/R"
              value={totalOutstanding}
              tone="amber"
              sub={
                stats.unpaidJobCount > 0
                  ? `${stats.unpaidJobCount} unpaid · ${oldestUnpaidDays}d oldest`
                  : "all caught up"
              }
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <OpsCard label="State inspections" today={ops.stateToday} week={ops.stateWeek} month={ops.stateMonth} />
            <OpsCard label="TNC inspections" today={ops.tncToday} week={ops.tncWeek} month={ops.tncMonth} />
            <OpsCard label="Jobs closed" today={ops.jobsClosedToday} week={ops.jobsClosedWeek} month={ops.jobsClosedMonth} />
          </div>
        </div>
      </section>

      <section className="pt-2">
        <SectionTitle
          num="02"
          title="Shop floor"
          sub={`${shopFloor.notStarted.length + shopFloor.waitingForParts.length + shopFloor.inProgress.length} open jobs`}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ShopFloorColumn status="not_started" jobs={shopFloor.notStarted} today={today} />
          <ShopFloorColumn status="waiting_for_parts" jobs={shopFloor.waitingForParts} today={today} />
          <ShopFloorColumn status="in_progress" jobs={shopFloor.inProgress} today={today} />
        </div>
      </section>

      <section className="pt-2">
        <SectionTitle
          num="03"
          title="Action center"
          sub={actionItemCount > 0 ? `${actionItemCount} items waiting` : "nothing pending"}
        />
        <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden divide-y divide-stone-100 dark:divide-stone-800/60">
          <ActionRow
            accent={oldestUnpaidDays >= 7 ? "red" : "amber"}
            icon={<DollarSign className="h-4 w-4" />}
            title="Unpaid"
            count={stats.unpaidJobCount}
            detail={
              stats.unpaidJobCount > 0
                ? `${formatCurrencyWhole(totalOutstanding)} · ${oldestUnpaidDays}d oldest`
                : undefined
            }
            href="/jobs?status=complete&payment_status=unpaid"
          />
          <ActionRow
            accent="amber"
            icon={<Send className="h-4 w-4" />}
            title="Pending estimates"
            count={pendingEstimateCount}
            detail={
              pendingEstimateCount > 0
                ? `${formatCurrencyWhole(estimateTotal)} awaiting · ${oldestEstimateDays}d oldest`
                : undefined
            }
            href="/jobs"
          />
          <ActionRow
            accent="blue"
            icon={<ClipboardCheck className="h-4 w-4" />}
            title="DVIs ready to send"
            count={dviReadyCount}
            detail={dviReadyCount > 0 ? "Awaiting manager review" : undefined}
            href="/dvi"
          />
          <ActionRow
            accent="blue"
            icon={<FileText className="h-4 w-4" />}
            title="New quote requests"
            count={newQuoteRequests}
            detail={newQuoteRequests > 0 ? "From the public site" : undefined}
            href="/quote-requests"
          />
          <ActionRow
            accent="indigo"
            icon={<Car className="h-4 w-4" />}
            title="Parking service leads"
            count={parkingServiceLeadCount}
            detail={parkingServiceLeadCount > 0 ? "Upsell opportunities" : undefined}
            href="/parking"
          />
        </div>
      </section>
    </div>
  );
}
