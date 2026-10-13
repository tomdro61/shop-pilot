import { Send } from "lucide-react";
import { formatDateTimeET } from "@/lib/utils/format";
import {
  allChannelsFailed,
  type DeliveryChannel,
  type InvoiceDeliveryGroup,
} from "@/lib/invoices/deliveries";
import type { ActionResult } from "@/lib/actions/_types";

const KIND_LABEL: Record<InvoiceDeliveryGroup["kind"], string> = {
  invoice: "Invoice sent",
  reminder: "Reminder",
  other: "Message",
};

const CHANNEL_LABEL: Record<DeliveryChannel, string> = {
  sms: "text",
  email: "email",
};

const FAILED_TEXT = "text-red-600 dark:text-red-400";

interface InvoiceDeliveryListProps {
  deliveries: ActionResult<InvoiceDeliveryGroup[]>;
  limit?: number;
  compact?: boolean;
}

function headline(group: InvoiceDeliveryGroup) {
  return allChannelsFailed(group) ? "Send failed" : KIND_LABEL[group.kind];
}

function channelNodes(group: InvoiceDeliveryGroup, separator: string) {
  return group.channels.flatMap(({ channel, failed }, i) => {
    const node = (
      <span key={channel} className={failed ? FAILED_TEXT : undefined}>
        {CHANNEL_LABEL[channel]}
        {failed ? " failed" : ""}
      </span>
    );
    return i === 0 ? [node] : [<span key={`sep-${channel}`}>{separator}</span>, node];
  });
}

export function InvoiceDeliveryList({
  deliveries,
  limit = 5,
  compact = false,
}: InvoiceDeliveryListProps) {
  if (!deliveries.ok) {
    // The cause is logged where the read ran; the raw Postgres text is no use here.
    return (
      <p className={`text-xs ${FAILED_TEXT} ${compact ? "mt-1" : ""}`}>
        Couldn&apos;t load send history
      </p>
    );
  }

  const groups = deliveries.data;
  if (groups.length === 0) return null;

  const shown = groups.slice(0, limit);
  const hidden = groups.length - shown.length;

  if (compact) {
    return (
      <ul className="mt-1.5 space-y-0.5 text-[11px] text-stone-500 dark:text-stone-400">
        {shown.map((g) => {
          const failed = allChannelsFailed(g);
          return (
            <li
              key={`${g.jobId}-${g.sentAt}`}
              className={`flex flex-wrap items-center gap-x-1 ${failed ? FAILED_TEXT : ""}`}
            >
              <span className="font-mono tabular-nums">{formatDateTimeET(g.sentAt)}</span>
              <span aria-hidden>·</span>
              <span>{headline(g).toLowerCase()}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex gap-1">{channelNodes(g, "+")}</span>
            </li>
          );
        })}
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
        {shown.map((g) => {
          const failed = allChannelsFailed(g);
          return (
            <li
              key={`${g.jobId}-${g.sentAt}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2 text-xs"
            >
              <span className="font-mono tabular-nums text-stone-700 dark:text-stone-300">
                {formatDateTimeET(g.sentAt)}
              </span>
              <span className={`font-medium ${failed ? FAILED_TEXT : "text-stone-900 dark:text-stone-50"}`}>
                {headline(g)}
              </span>
              <span className="inline-flex gap-1 text-stone-500 dark:text-stone-400">
                via {channelNodes(g, "+")}
              </span>
              {g.kind === "other" && (
                <span className="basis-full text-stone-500 dark:text-stone-400 truncate">{g.excerpt}</span>
              )}
            </li>
          );
        })}
        {hidden > 0 && (
          <li className="px-4 py-2 text-xs text-stone-500 dark:text-stone-400">
            +{hidden} earlier
          </li>
        )}
      </ul>
    </div>
  );
}
