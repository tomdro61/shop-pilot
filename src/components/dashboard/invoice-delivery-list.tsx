import { Send } from "lucide-react";
import { formatDateTimeET } from "@/lib/utils/format";
import type { InvoiceDeliveryGroup } from "@/lib/invoices/deliveries";

const KIND_LABEL: Record<InvoiceDeliveryGroup["kind"], string> = {
  invoice: "Invoice sent",
  reminder: "Reminder",
  other: "Message",
};

const CHANNEL_LABEL: Record<"sms" | "email", string> = {
  sms: "text",
  email: "email",
};

interface InvoiceDeliveryListProps {
  groups: InvoiceDeliveryGroup[];
  error?: string | null;
  limit?: number;
  compact?: boolean;
}

function channelSummary(group: InvoiceDeliveryGroup) {
  return group.channels.map((c) => {
    const failed = group.failedChannels.includes(c);
    return (
      <span key={c} className={failed ? "text-red-600 dark:text-red-400" : undefined}>
        {CHANNEL_LABEL[c]}
        {failed ? " failed" : ""}
      </span>
    );
  });
}

export function InvoiceDeliveryList({
  groups,
  error = null,
  limit = 5,
  compact = false,
}: InvoiceDeliveryListProps) {
  if (error) {
    return (
      <p className={`text-xs text-red-600 dark:text-red-400 ${compact ? "mt-1" : ""}`}>
        Couldn&apos;t load send history: {error}
      </p>
    );
  }
  if (groups.length === 0) return null;

  const shown = groups.slice(0, limit);
  const hidden = groups.length - shown.length;

  if (compact) {
    return (
      <ul className="mt-1.5 space-y-0.5 text-[11px] text-stone-500 dark:text-stone-400">
        {shown.map((g) => (
          <li key={`${g.jobId}-${g.sentAt}`} className="flex flex-wrap items-center gap-x-1">
            <span className="font-mono tabular-nums">{formatDateTimeET(g.sentAt)}</span>
            <span aria-hidden>·</span>
            <span>{KIND_LABEL[g.kind].toLowerCase()}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex gap-1">{channelSummary(g)}</span>
          </li>
        ))}
        {hidden > 0 && <li>+{hidden} more</li>}
      </ul>
    );
  }

  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-2 bg-stone-50 dark:bg-stone-900/60 border-b border-stone-200 dark:border-stone-800 text-[11px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300">
        <Send className="h-3 w-3" aria-hidden />
        Sent to customer
      </div>
      <ul className="divide-y divide-stone-200 dark:divide-stone-800">
        {shown.map((g) => (
          <li
            key={`${g.jobId}-${g.sentAt}`}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2 text-xs"
          >
            <span className="font-mono tabular-nums text-stone-700 dark:text-stone-300">
              {formatDateTimeET(g.sentAt)}
            </span>
            <span className="font-medium text-stone-900 dark:text-stone-50">{KIND_LABEL[g.kind]}</span>
            <span className="inline-flex gap-1 text-stone-500 dark:text-stone-400">
              {g.channels.length > 0 ? "via " : null}
              {channelSummary(g).flatMap((node, i) => (i === 0 ? [node] : [<span key={`sep-${i}`}>+</span>, node]))}
            </span>
            {g.kind === "other" && (
              <span className="basis-full text-stone-500 dark:text-stone-400 truncate">{g.excerpt}</span>
            )}
          </li>
        ))}
        {hidden > 0 && (
          <li className="px-4 py-2 text-xs text-stone-500 dark:text-stone-400">
            +{hidden} earlier
          </li>
        )}
      </ul>
    </div>
  );
}
