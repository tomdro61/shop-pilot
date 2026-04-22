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

  return (
    <div className="fixed bottom-14 lg:sticky lg:bottom-0 left-0 right-0 z-20 bg-[#0F172A] text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 lg:px-6">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Grand Total
          </span>
          <span className="font-mono tabular-nums text-2xl lg:text-3xl font-semibold text-white">
            {formatCurrency(grandTotal)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-100`}>
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[paymentStatus] ?? "bg-slate-400"}`} />
            {PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus}
          </span>
          {paymentMethod && (
            <span className="text-xs text-slate-400">
              via {PAYMENT_METHOD_LABELS[paymentMethod]}
            </span>
          )}
        </div>

        {showMarkAsPaid && (
          <div className="ml-auto flex items-center gap-2">
            <TerminalPayButton
              jobId={jobId}
              amountCents={Math.round(grandTotal * 100)}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={loading}>
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
