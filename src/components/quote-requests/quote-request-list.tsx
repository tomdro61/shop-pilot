"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect, useRef, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  QUOTE_REQUEST_STATUS_ORDER,
  QUOTE_REQUEST_STATUS_LABELS,
  QUOTE_REQUEST_STATUS_COLORS,
} from "@/lib/constants";
import { updateQuoteRequestStatus, deleteQuoteRequest } from "@/lib/actions/quote-requests";
import { Search, Phone, Mail, Car, MessageSquare, ExternalLink, Wrench, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import type { QuoteRequest, QuoteRequestStatus } from "@/types";

export function QuoteRequestList({
  quoteRequests,
}: {
  quoteRequests: QuoteRequest[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const currentStatus = searchParams.get("status") || "";
  const [isPending, startTransition] = useTransition();
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      startTransition(() => {
        router.push(`/quote-requests?${params.toString()}`);
      });
    },
    [router]
  );

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      const current = searchParamsRef.current.get("search") || "";
      if (searchInput !== current) {
        updateParams({ search: searchInput });
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput, updateParams]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            placeholder="Search name, email, phone, vehicle..."
            className="pl-9 h-9 text-sm"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select
          value={currentStatus || "all"}
          onValueChange={(value) =>
            updateParams({ status: value === "all" ? "" : value })
          }
        >
          <SelectTrigger className="w-full sm:w-[160px] h-9 text-xs">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {QUOTE_REQUEST_STATUS_ORDER.map((status) => (
              <SelectItem key={status} value={status}>
                {QUOTE_REQUEST_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Count */}
      <p className="text-xs text-stone-500 dark:text-stone-400">
        {quoteRequests.length} quote request{quoteRequests.length !== 1 ? "s" : ""}
      </p>

      {/* List */}
      <div className={isPending ? "opacity-50 transition-opacity duration-150" : ""}>
        {quoteRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-8 text-center">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              No quote requests found.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {quoteRequests.map((qr) => (
              <QuoteRequestCard key={qr.id} quoteRequest={qr} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuoteRequestCard({ quoteRequest: qr }: { quoteRequest: QuoteRequest }) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const status = qr.status as QuoteRequestStatus;
  const statusColors = QUOTE_REQUEST_STATUS_COLORS[status] || QUOTE_REQUEST_STATUS_COLORS.new;

  const vehicle = [qr.vehicle_year, qr.vehicle_make, qr.vehicle_model].filter(Boolean).join(" ");
  const date = new Date(qr.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  async function handleStatusChange(newStatus: string) {
    setIsUpdating(true);
    const result = await updateQuoteRequestStatus(qr.id, newStatus as QuoteRequestStatus);
    setIsUpdating(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(`Status updated to ${QUOTE_REQUEST_STATUS_LABELS[newStatus as QuoteRequestStatus]}`);
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(`Delete quote request from ${qr.first_name} ${qr.last_name}?`)) return;
    setIsUpdating(true);
    const result = await deleteQuoteRequest(qr.id);
    setIsUpdating(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Quote request deleted");
    }
    router.refresh();
  }

  const convertUrl = qr.customer_id
    ? `/jobs/new?customerId=${qr.customer_id}&fromQuote=${qr.id}`
    : `/jobs/new?fromQuote=${qr.id}`;

  return (
    <div
      className={cn(
        "rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 transition-opacity",
        isUpdating && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          {/* Name + Status + Date */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">
              {qr.first_name} {qr.last_name}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                statusColors.bg,
                statusColors.text
              )}
            >
              {QUOTE_REQUEST_STATUS_LABELS[status] || status}
            </span>
            <span className="text-[11px] text-stone-400 dark:text-stone-500">{date}</span>
          </div>

          {/* Contact */}
          <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400">
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {qr.phone}
            </span>
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {qr.email}
            </span>
          </div>

          {/* Vehicle */}
          {vehicle && (
            <div className="flex items-center gap-1 text-xs text-stone-600 dark:text-stone-300">
              <Car className="h-3 w-3 text-stone-400" />
              {vehicle}
            </div>
          )}

          {/* Services */}
          <div className="flex flex-wrap gap-1">
            {qr.services.map((s) => (
              <span
                key={s}
                className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-400"
              >
                {s}
              </span>
            ))}
          </div>

          {/* Message */}
          {qr.message && (
            <div className="flex items-start gap-1 text-xs text-stone-500 dark:text-stone-400">
              <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="line-clamp-2">{qr.message}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 shrink-0">
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-7 w-[120px] text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUOTE_REQUEST_STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {QUOTE_REQUEST_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {status !== "converted" && (
            <Link href={convertUrl}>
              <Button variant="outline" size="sm" className="h-7 w-[120px] gap-1 text-[11px]">
                <Wrench className="h-3 w-3" />
                Convert to Job
              </Button>
            </Link>
          )}

          {qr.quo_contact_id && (
            <a
              href={`https://app.quo.is/contacts/${qr.quo_contact_id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="ghost" size="sm" className="h-7 w-[120px] gap-1 text-[11px]">
                <ExternalLink className="h-3 w-3" />
                Quo Contact
              </Button>
            </a>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-[120px] gap-1 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
            onClick={handleDelete}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
