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
import {
  Search,
  Phone,
  Mail,
  Car,
  ExternalLink,
  Wrench,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import type { QuoteRequest, QuoteRequestStatus } from "@/types";

const filterTabs: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  ...QUOTE_REQUEST_STATUS_ORDER.map((s) => ({
    value: s,
    label: QUOTE_REQUEST_STATUS_LABELS[s],
  })),
];

function ageDays(createdAt: string): number {
  const now = Date.now();
  const then = new Date(createdAt).getTime();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}

function ageBadgeClass(days: number): string {
  if (days >= 7) return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400";
  if (days >= 3) return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400";
  return "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400";
}

export function QuoteRequestList({
  quoteRequests,
  photoUrls,
}: {
  quoteRequests: QuoteRequest[];
  photoUrls: Record<string, string>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  // No status param → default landing on "new". "all" sentinel = no filter.
  const currentStatus = searchParams.get("status") || "new";
  const [isPending, startTransition] = useTransition();
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

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
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400 pointer-events-none" />
          <Input
            placeholder="Search quotes..."
            className="pl-9 h-10 text-sm bg-card border-stone-200 dark:bg-stone-900 dark:border-stone-800"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filterTabs.map((tab) => {
            const active = currentStatus === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => updateParams({ status: tab.value })}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center h-8 px-3 rounded-md border text-sm font-medium transition-colors",
                  active
                    ? "bg-stone-100 border-stone-300 text-stone-900 dark:bg-stone-800 dark:border-stone-800 dark:text-stone-50"
                    : "bg-card border-stone-200 text-stone-600 hover:bg-stone-50 dark:bg-stone-900 dark:border-stone-800 dark:text-stone-400 dark:hover:bg-stone-800/60"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className={isPending ? "opacity-50 transition-opacity duration-150" : ""}>
        {quoteRequests.length === 0 ? (
          <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card p-8 text-center">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              No quote requests found.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {quoteRequests.map((qr) => (
              <QuoteRequestCard key={qr.id} quoteRequest={qr} photoUrls={photoUrls} />
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
    <div className="rounded-md bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800 px-4 py-3">
      <p
        ref={textRef}
        className={cn(
          "text-sm italic text-stone-700 dark:text-stone-300",
          !expanded && "line-clamp-3"
        )}
      >
        &ldquo;{message}&rdquo;
      </p>
      {(isTruncated || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function QuoteRequestCard({
  quoteRequest: qr,
  photoUrls,
}: {
  quoteRequest: QuoteRequest;
  photoUrls: Record<string, string>;
}) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const status = qr.status as QuoteRequestStatus;
  const days = ageDays(qr.created_at);

  const vehicle = [qr.vehicle_year, qr.vehicle_make, qr.vehicle_model]
    .filter(Boolean)
    .join(" ");
  const date = new Date(qr.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const initials = `${qr.first_name?.[0] ?? ""}${qr.last_name?.[0] ?? ""}`.toUpperCase();

  async function handleStatusChange(newStatus: string) {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const result = await updateQuoteRequestStatus(qr.id, newStatus as QuoteRequestStatus);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(
          `Status updated to ${QUOTE_REQUEST_STATUS_LABELS[newStatus as QuoteRequestStatus]}`
        );
      }
      router.refresh();
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleDelete() {
    if (isUpdating) return;
    if (!confirm(`Delete quote request from ${qr.first_name} ${qr.last_name}?`)) return;
    setIsUpdating(true);
    try {
      const result = await deleteQuoteRequest(qr.id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Quote request deleted");
      }
      router.refresh();
    } finally {
      setIsUpdating(false);
    }
  }

  const convertUrl = qr.customer_id
    ? `/jobs/new?customerId=${qr.customer_id}&fromQuote=${qr.id}`
    : `/jobs/new?fromQuote=${qr.id}`;

  return (
    <div
      className={cn(
        "bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden transition-opacity",
        isUpdating && "opacity-50"
      )}
    >
      {/* Header — avatar + name/contact + age + status */}
      <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-xs font-bold uppercase tracking-wider bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
              {qr.first_name} {qr.last_name}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
              {qr.phone && (
                <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                  <Phone className="h-3 w-3" />
                  {qr.phone}
                </span>
              )}
              {qr.email && (
                <span className="inline-flex items-center gap-1 truncate">
                  <Mail className="h-3 w-3" />
                  {qr.email}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            title={date}
            className={cn(
              "inline-flex items-center font-mono tabular-nums px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap",
              ageBadgeClass(days)
            )}
          >
            {days === 0 ? "today" : `${days}d`}
          </span>
          <Select value={status} onValueChange={handleStatusChange} disabled={isUpdating}>
            <SelectTrigger className="w-auto h-8 text-xs gap-1.5 px-3">
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
      </header>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        {/* Vehicle + services */}
        {(vehicle || qr.services.length > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {vehicle ? (
              <div className="inline-flex items-center gap-2">
                <span className="w-7 h-7 rounded-md grid place-items-center border bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-800 flex-none">
                  <Car className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-medium text-stone-900 dark:text-stone-50">
                  {vehicle}
                </span>
              </div>
            ) : (
              <span />
            )}
            {qr.services.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {qr.services.map((s) => (
                  <span
                    key={s}
                    className="text-[10px] font-black px-2 py-1 rounded-md uppercase bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Customer note */}
        {qr.message && <MessageBlock message={qr.message} />}

        {/* Customer photos — open full-size in a new tab */}
        {qr.photo_paths.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {qr.photo_paths.map((p) => {
              const url = photoUrls[p];
              if (!url) return null;
              return (
                <a
                  key={p}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-md border border-stone-200 dark:border-stone-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Customer-submitted photo" className="h-16 w-16 object-cover" />
                </a>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
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
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in Quo
            </a>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={isUpdating}
            aria-label="Delete quote request"
            className="ml-auto text-stone-400 dark:text-stone-500 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
