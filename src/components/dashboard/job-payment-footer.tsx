"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { recordPayment } from "@/lib/actions/jobs";
import { formatCurrency } from "@/lib/utils/format";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { CreditCard, Banknote, Landmark, CircleDollarSign, ChevronDown } from "lucide-react";
import { TerminalPayButton } from "@/components/dashboard/terminal-pay-button";
import type { JobStatus, PaymentStatus, PaymentMethod } from "@/types";

const paymentMethods: { value: PaymentMethod; label: string; icon: typeof CreditCard }[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "check", label: "Check", icon: CircleDollarSign },
  { value: "ach", label: "ACH", icon: Landmark },
  { value: "stripe", label: "Card", icon: CreditCard },
];

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

  const statusColors = PAYMENT_STATUS_COLORS[paymentStatus];

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
    <div className="sticky bottom-0 z-20 border-t border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <p className="text-2xl font-bold tabular-nums tracking-tight">
            {formatCurrency(grandTotal)}
          </p>
          <Badge
            variant="outline"
            className={`${statusColors?.bg ?? ""} ${statusColors?.text ?? ""}`}
          >
            {PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus}
          </Badge>
          {paymentMethod && (
            <span className="text-xs text-muted-foreground">
              via {PAYMENT_METHOD_LABELS[paymentMethod]}
            </span>
          )}
        </div>
        {showMarkAsPaid && (
          <div className="flex items-center gap-2">
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
