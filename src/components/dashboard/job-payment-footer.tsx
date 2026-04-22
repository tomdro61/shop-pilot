"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { recordPayment } from "@/lib/actions/jobs";
import { formatCurrency } from "@/lib/utils/format";
import { PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { CreditCard, Banknote, Landmark, CircleDollarSign, ChevronDown } from "lucide-react";
import { TerminalPayButton } from "@/components/dashboard/terminal-pay-button";
import type { JobStatus, PaymentStatus, PaymentMethod } from "@/types";

const paymentMethods: { value: PaymentMethod; label: string; icon: typeof CreditCard }[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "check", label: "Check", icon: CircleDollarSign },
  { value: "ach", label: "ACH", icon: Landmark },
  { value: "stripe", label: "Card", icon: CreditCard },
];

const STATUS_DOT: Record<PaymentStatus, string> = {
  unpaid: "bg-red-400",
  invoiced: "bg-amber-400",
  paid: "bg-emerald-400",
  waived: "bg-stone-400",
};

const STATUS_PILL: Record<PaymentStatus, string> = {
  unpaid: "bg-red-500/15 text-red-200",
  invoiced: "bg-amber-500/15 text-amber-200",
  paid: "bg-emerald-500/15 text-emerald-200",
  waived: "bg-slate-500/20 text-slate-300",
};

interface JobPaymentFooterProps {
  jobId: string;
  jobStatus: JobStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  grandTotal: number;
}

export function JobPaymentFooter({
  jobId,
  jobStatus,
  paymentStatus,
  paymentMethod,
  grandTotal,
}: JobPaymentFooterProps) {
  const [loading, setLoading] = useState(false);

  if (grandTotal <= 0) return null;

  const showMarkAsPaid =
    jobStatus === "complete" &&
    paymentStatus !== "paid" &&
    paymentStatus !== "waived";

  async function handleRecordPayment(method: PaymentMethod) {
    setLoading(true);
    const result = await recordPayment(jobId, method);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Payment recorded (${PAYMENT_METHOD_LABELS[method]})`);
    }
  }

  const isSettled = paymentStatus === "paid" || paymentStatus === "waived";
  const balanceDue = isSettled ? 0 : grandTotal;

  return (
    <div className="fixed bottom-14 lg:sticky lg:bottom-0 left-0 right-0 z-20 bg-[#0F172A] text-white border-t border-slate-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-stretch gap-y-3 px-4 py-3 lg:py-4 lg:px-6">

        <div className="flex flex-col justify-center pr-4 lg:pr-6">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Grand Total
          </span>
          <span className="font-mono tabular-nums text-[28px] lg:text-[34px] font-bold text-white leading-none mt-1.5 -tracking-[0.01em]">
            {formatCurrency(grandTotal)}
          </span>
        </div>

        <div className="hidden lg:flex flex-col justify-center px-6 border-l border-slate-800">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Balance Due
          </span>
          <span className={`font-mono tabular-nums text-base font-semibold leading-none mt-2 ${balanceDue > 0 ? "text-white" : "text-slate-500"}`}>
            {formatCurrency(balanceDue)}
          </span>
        </div>

        <div className="flex flex-col justify-center pl-4 lg:px-6 lg:border-l lg:border-slate-800">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Payment
          </span>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_PILL[paymentStatus] ?? "bg-slate-800 text-slate-200"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[paymentStatus] ?? "bg-slate-400"}`} />
              {PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus}
            </span>
            {paymentMethod && (
              <span className="text-[11px] text-slate-400">
                via {PAYMENT_METHOD_LABELS[paymentMethod]}
              </span>
            )}
          </div>
        </div>

        {showMarkAsPaid && (
          <div className="ml-auto flex items-center gap-2 self-center w-full justify-end lg:w-auto">
            <TerminalPayButton
              jobId={jobId}
              amountCents={Math.round(grandTotal * 100)}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  disabled={loading}
                  className="bg-transparent border border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white shadow-none"
                >
                  {loading ? "Recording..." : "Mark as Paid"}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {paymentMethods.map((pm) => (
                  <DropdownMenuItem
                    key={pm.value}
                    onClick={() => handleRecordPayment(pm.value)}
                  >
                    <pm.icon className="mr-2 h-4 w-4" />
                    {pm.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  );
}
