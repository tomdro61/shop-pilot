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
} from "@/lib/constants";
import { updateQuoteRequestStatus, deleteQuoteRequest } from "@/lib/actions/quote-requests";
import { Search, Phone, Mail, Car, MessageSquare, ExternalLink, Wrench, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import type { QuoteRequest, QuoteRequestStatus } from "@/types";

const filterTabs: { value: string; label: string }[] = [
  { value: "", label: "All" },
  ...QUOTE_REQUEST_STATUS_ORDER.map((s) => ({
    value: s,
    label: QUOTE_REQUEST_STATUS_LABELS[s],
  })),
];

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
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            placeholder="Search quotes..."
            className="pl-11 h-10 text-sm"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {filterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => updateParams({ status: tab.value })}
              className={cn(
                "rounded-md px-3.5 py-1.5 text-xs font-bold transition-colors",
                currentStatus === tab.value
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className={isPending ? "opacity-50 transition-opacity duration-150" : ""}>
        {quoteRequests.length === 0 ? (
          <div className="bg-card rounded-lg shadow-card p-8 text-center">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              No quote requests found.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {quoteRequests.map((qr) => (
              <QuoteRequestCard key={qr.id} quoteRequest={qr} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBlock({ message }: { message: string }) {
  const [expanded, setExpanded] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (el) setIsTruncated(el.scrollHeight > el.clientHeight);
  }, [message]);

  return (
    <div className="mb-4 rounded-lg bg-stone-50 dark:bg-stone-800/50 px-4 py-3">
      <p
        ref={textRef}
        className={cn(
          "text-sm italic text-stone-500 dark:text-stone-400",
          !expanded && "line-clamp-3"
        )}
      >
        &ldquo;{message}&rdquo;
      </p>
      {(isTruncated || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function QuoteRequestCard({ quoteRequest: qr }: { quoteRequest: QuoteRequest }) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const status = qr.status as QuoteRequestStatus;

  const vehicle = [qr.vehicle_year, qr.vehicle_make, qr.vehicle_model].filter(Boolean).join(" ");
  const date = new Date(qr.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const initials = `${qr.first_name?.[0] ?? ""}${qr.last_name?.[0] ?? ""}`.toUpperCase();

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
        "bg-card rounded-lg shadow-card px-6 py-5 transition-opacity",
        isUpdating && "opacity-50"
      )}
    >
      {/* Header: Avatar + Name/Date + Status */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950 text-xs font-bold text-blue-700 dark:text-blue-400">
            {initials}
          </div>
          <div>
            <p className="text-sm font-bold text-stone-900 dark:text-stone-50">
              {qr.first_name} {qr.last_name}
            </p>
            <p className="text-[11px] uppercase tracking-widest text-stone-400 dark:text-stone-500">
              Submission <span className="normal-case tracking-normal">{date}</span>
            </p>
          </div>
        </div>
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-auto h-8 text-xs border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 shadow-none gap-1.5 px-3">
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
      </div>

      {/* Contact */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-stone-500 dark:text-stone-400 mb-4">
        {qr.email && (
          <span className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            {qr.email}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5" />
          {qr.phone}
        </span>
      </div>

      {/* Vehicle + Services */}
      {(vehicle || qr.services.length > 0) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {vehicle && (
            <div className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
              <Car className="h-4 w-4 text-stone-400 dark:text-stone-500" />
              {vehicle}
            </div>
          )}
          {qr.services.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {qr.services.map((s) => (
                <span
                  key={s}
                  className="text-[10px] font-black px-2 py-1 rounded-md uppercase bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Message */}
      {qr.message && (
        <MessageBlock message={qr.message} />
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {status !== "converted" && (
          <Link href={convertUrl}>
            <Button size="sm">
              <Wrench className="mr-1.5 h-3.5 w-3.5" />
              Convert to Job
            </Button>
          </Link>
        )}

        {qr.quo_contact_id && (
          <a
            href={`https://my.quo.com/inbox/PNq6UNTzCW/c/${qr.quo_contact_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Quo
          </a>
        )}

        <button
          onClick={handleDelete}
          className="ml-auto text-stone-300 dark:text-stone-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
