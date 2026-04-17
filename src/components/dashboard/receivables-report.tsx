"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatCurrency } from "@/lib/utils/format";
import { formatRONumber } from "@/lib/utils/format";
import type { ReceivablesData } from "@/lib/actions/receivables";
import { CustomerTypePills } from "@/components/dashboard/customer-type-pills";

type PaymentFilter = "all" | "unpaid" | "invoiced";

interface ReceivablesReportProps {
  data: ReceivablesData;
  initialCustomerType?: string;
}

export function ReceivablesReport({ data, initialCustomerType = "all" }: ReceivablesReportProps) {
  const router = useRouter();
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");

  function setCustomerType(type: string) {
    const params = new URLSearchParams();
    if (type !== "all") params.set("customerType", type);
    router.push(`/reports/receivables?${params.toString()}`);
  }

  const filteredJobs = data.jobs.filter((job) => {
    if (paymentFilter !== "all" && job.paymentStatus !== paymentFilter) return false;
    return true;
  });

  const filteredTotal = filteredJobs.reduce((s, j) => s + j.amount, 0);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          title="Total Outstanding"
          value={formatCurrency(data.totalOutstanding)}
          accentColor="blue"
        />
        <KpiCard
          title="0–30 Days"
          value={formatCurrency(data.aging0to30)}
          accentColor="emerald"
        />
        <KpiCard
          title="31–60 Days"
          value={formatCurrency(data.aging31to60)}
          accentColor="amber"
        />
        <KpiCard
          title="60+ Days"
          value={formatCurrency(data.aging60plus)}
          subtitle={data.aging60plus > 0 ? "Needs attention" : undefined}
          accentColor="purple"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <CustomerTypePills value={initialCustomerType} onChange={setCustomerType} />
          <div className="flex gap-1">
            {(["all", "unpaid", "invoiced"] as PaymentFilter[]).map((p) => (
              <Button
                key={p}
                variant={paymentFilter === p ? "default" : "outline"}
                size="sm"
                onClick={() => setPaymentFilter(p)}
              >
                {p === "all" ? "All Statuses" : p === "unpaid" ? "Unpaid" : "Invoiced"}
              </Button>
            ))}
          </div>
          <span className="ml-auto text-sm text-muted-foreground">
            {filteredJobs.length} job{filteredJobs.length !== 1 ? "s" : ""} — {formatCurrency(filteredTotal)}
          </span>
        </CardContent>
      </Card>

      {/* Outstanding Jobs Table */}
      <Card className="py-0 gap-0">
        <CardHeader className="bg-stone-800 dark:bg-stone-900 px-5 py-3">
          <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-stone-100">
            Outstanding Jobs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 text-left">
                  <th className="pb-2 pr-4 pt-4 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Customer</th>
                  <th className="pb-2 pr-4 pt-4 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Job</th>
                  <th className="pb-2 pr-4 pt-4 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">RO #</th>
                  <th className="pb-2 pr-4 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Amount</th>
                  <th className="pb-2 pr-4 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Days</th>
                  <th className="pb-2 pt-4 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No outstanding jobs
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                      <td className="py-2 pr-4 font-medium">
                        <Link href={`/customers/${job.customerId}`} className="text-blue-600 hover:underline dark:text-blue-400">
                          {job.customerName}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        <Link href={`/jobs/${job.id}`} className="hover:underline">
                          {job.title || "Untitled"}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                        {formatRONumber(job.roNumber)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums font-medium">
                        {formatCurrency(job.amount)}
                      </td>
                      <td className={`py-2 pr-4 text-right tabular-nums ${job.daysOutstanding > 60 ? "text-red-600 dark:text-red-400 font-bold" : job.daysOutstanding > 30 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                        {job.daysOutstanding}
                      </td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                          job.paymentStatus === "invoiced"
                            ? "bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-100"
                            : "bg-stone-100 text-stone-950 dark:bg-stone-800 dark:text-stone-100"
                        }`}>
                          {job.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Fleet A/R Aging */}
      {data.fleetAccounts.length > 0 && (
        <Card className="py-0 gap-0">
          <CardHeader className="bg-stone-800 dark:bg-stone-900 px-5 py-3">
            <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-stone-100">
              Fleet A/R Aging
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-800 text-left">
                    <th className="pb-2 pr-4 pt-4 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Account</th>
                    <th className="pb-2 pr-4 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">0–30 Days</th>
                    <th className="pb-2 pr-4 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">31–60 Days</th>
                    <th className="pb-2 pr-4 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">60+ Days</th>
                    <th className="pb-2 pt-4 text-right text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fleetAccounts.map((row) => (
                    <tr key={row.account}>
                      <td className="py-2 pr-4 font-medium">{row.account}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(row.current)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(row.days31to60)}</td>
                      <td className={`py-2 pr-4 text-right tabular-nums ${row.days60plus > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                        {row.days60plus > 0 ? formatCurrency(row.days60plus) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium">{formatCurrency(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
