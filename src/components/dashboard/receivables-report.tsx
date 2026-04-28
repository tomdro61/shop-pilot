"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { COLUMN_HEADER, SECTION_LABEL } from "@/components/ui/section-card";
import { formatCurrency, formatRONumber } from "@/lib/utils/format";
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
      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm flex flex-wrap items-center gap-3 px-4 py-3">
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
        <span className="ml-auto text-sm text-stone-500 dark:text-stone-400">
          <span className="font-mono tabular-nums">{filteredJobs.length}</span> job{filteredJobs.length !== 1 ? "s" : ""} — <span className="font-mono tabular-nums font-medium text-stone-900 dark:text-stone-50">{formatCurrency(filteredTotal)}</span>
        </span>
      </div>

      {/* Outstanding Jobs Table */}
      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-sidebar border-b border-stone-200 dark:border-stone-800">
          <h3 className={COLUMN_HEADER}>Outstanding Jobs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800/60 text-left">
                <th className={`px-4 py-2 ${SECTION_LABEL}`}>Customer</th>
                <th className={`px-4 py-2 ${SECTION_LABEL}`}>Job</th>
                <th className={`px-4 py-2 ${SECTION_LABEL}`}>RO #</th>
                <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Amount</th>
                <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Days</th>
                <th className={`px-4 py-2 ${SECTION_LABEL}`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-stone-500 dark:text-stone-400">
                    No outstanding jobs
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <tr key={job.id} className="border-b border-stone-100 dark:border-stone-800/60 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/40">
                    <td className="px-4 py-2 text-sm font-medium">
                      <Link href={`/customers/${job.customerId}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                        {job.customerName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-sm text-stone-700 dark:text-stone-300">
                      <Link href={`/jobs/${job.id}`} className="hover:underline">
                        {job.title || "Untitled"}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono tabular-nums text-sm text-stone-500 dark:text-stone-400">
                      {formatRONumber(job.roNumber)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-sm font-medium text-stone-900 dark:text-stone-50">
                      {formatCurrency(job.amount)}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono tabular-nums text-sm ${job.daysOutstanding > 60 ? "text-red-600 dark:text-red-400 font-bold" : job.daysOutstanding > 30 ? "text-amber-600 dark:text-amber-400" : "text-stone-700 dark:text-stone-300"}`}>
                      {job.daysOutstanding}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${
                        job.paymentStatus === "invoiced"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                          : "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-400"
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
      </div>

      {/* Fleet A/R Aging */}
      {data.fleetAccounts.length > 0 && (
        <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-sidebar border-b border-stone-200 dark:border-stone-800">
            <h3 className={COLUMN_HEADER}>Fleet A/R Aging</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 dark:border-stone-800/60 text-left">
                  <th className={`px-4 py-2 ${SECTION_LABEL}`}>Account</th>
                  <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>0–30 Days</th>
                  <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>31–60 Days</th>
                  <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>60+ Days</th>
                  <th className={`px-4 py-2 text-right ${SECTION_LABEL}`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.fleetAccounts.map((row) => (
                  <tr key={row.account} className="border-b border-stone-100 dark:border-stone-800/60 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/40">
                    <td className="px-4 py-2 text-sm font-medium text-stone-900 dark:text-stone-50">{row.account}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-stone-700 dark:text-stone-300">{formatCurrency(row.current)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-stone-700 dark:text-stone-300">{formatCurrency(row.days31to60)}</td>
                    <td className={`px-4 py-2 text-right font-mono tabular-nums text-sm ${row.days60plus > 0 ? "text-red-600 dark:text-red-400" : "text-stone-700 dark:text-stone-300"}`}>
                      {row.days60plus > 0 ? formatCurrency(row.days60plus) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-sm font-medium text-stone-900 dark:text-stone-50">{formatCurrency(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
