"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DVI_STATUS_LABELS, DVI_STATUS_COLORS, DVI_CONDITION_COLORS } from "@/lib/constants";
import { formatDate } from "@/lib/utils/format";
import { ClipboardCheck, Send, Eye, ExternalLink } from "lucide-react";
import { SendDviDialog } from "@/components/dvi/send-dvi-dialog";
import type { DviStatus, DviCondition } from "@/types";

interface DviResult {
  id: string;
  condition: DviCondition | null;
  item_name: string;
  category_name: string;
  note: string | null;
  is_recommended: boolean;
  recommended_description: string | null;
  recommended_price: number | null;
}

interface DviInspection {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  sent_at: string | null;
  approval_token: string | null;
  send_mode: string | null;
  dvi_results: DviResult[];
}

interface DviSectionProps {
  jobId: string;
  inspection: DviInspection | null;
}

const SECTION_LABEL = "text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400";

export function DviSection({ jobId, inspection }: DviSectionProps) {
  const [sendOpen, setSendOpen] = useState(false);

  const status = inspection?.status as DviStatus | undefined;
  const statusColors = status ? DVI_STATUS_COLORS[status] : null;

  // Count conditions
  const results = inspection?.dvi_results ?? [];
  const counts = { good: 0, monitor: 0, attention: 0, total: results.length, rated: 0 };
  for (const r of results) {
    if (r.condition === "good") { counts.good++; counts.rated++; }
    else if (r.condition === "monitor") { counts.monitor++; counts.rated++; }
    else if (r.condition === "attention") { counts.attention++; counts.rated++; }
  }

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-stone-50 dark:bg-stone-900/40 border-b border-stone-200 dark:border-stone-800">
          <h3 className={`flex items-center gap-1.5 ${SECTION_LABEL}`}>
            <ClipboardCheck className="h-3 w-3" />
            Vehicle Inspection
          </h3>
          {status && statusColors && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${statusColors.bg} ${statusColors.text}`}>
              {DVI_STATUS_LABELS[status]}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          {!inspection ? (
            <p className="text-sm text-stone-500 dark:text-stone-400 text-center py-2">
              No inspection yet — tech will start from their portal.
            </p>
          ) : status === "in_progress" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-500 dark:text-stone-400">Progress</span>
                <span className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                  {counts.rated} / {counts.total}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: counts.total > 0 ? `${(counts.rated / counts.total) * 100}%` : "0%" }}
                />
              </div>
              <div className="flex justify-between text-xs pt-1">
                <span className="text-stone-500 dark:text-stone-400">Started</span>
                <span className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                  {formatDate(inspection.created_at)}
                </span>
              </div>
            </div>
          ) : status === "completed" ? (
            <div className="space-y-3">
              {/* Condition chips */}
              <div className="flex gap-1.5 flex-wrap">
                {(["good", "monitor", "attention"] as const).map((c) => (
                  <span
                    key={c}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${DVI_CONDITION_COLORS[c].bg} ${DVI_CONDITION_COLORS[c].text}`}
                  >
                    <span className="font-mono tabular-nums">{counts[c]}</span>
                    <span className="capitalize">{c}</span>
                  </span>
                ))}
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="text-stone-500 dark:text-stone-400">Completed</dt>
                <dd className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                  {inspection.completed_at ? formatDate(inspection.completed_at) : "—"}
                </dd>
              </dl>

              <div className="flex gap-2 pt-1">
                <a href={`/jobs/${jobId}/dvi`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    View Report
                  </Button>
                </a>
                <Button size="sm" onClick={() => setSendOpen(true)}>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Send to Customer
                </Button>
              </div>
            </div>
          ) : status === "sent" ? (
            <div className="space-y-3">
              {/* Condition chips */}
              <div className="flex gap-1.5 flex-wrap">
                {(["good", "monitor", "attention"] as const).map((c) => (
                  <span
                    key={c}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${DVI_CONDITION_COLORS[c].bg} ${DVI_CONDITION_COLORS[c].text}`}
                  >
                    <span className="font-mono tabular-nums">{counts[c]}</span>
                    <span className="capitalize">{c}</span>
                  </span>
                ))}
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="text-stone-500 dark:text-stone-400">Sent</dt>
                <dd className="font-mono tabular-nums text-stone-900 dark:text-stone-50">
                  {inspection.sent_at ? formatDate(inspection.sent_at) : ""}
                </dd>
              </dl>

              <div className="flex gap-2 pt-1">
                <a href={`/jobs/${jobId}/dvi`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    View Report
                  </Button>
                </a>
                {inspection.approval_token && (
                  <a
                    href={`${appUrl}/inspect/${inspection.approval_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Customer Link
                    </Button>
                  </a>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {inspection && (
        <SendDviDialog
          inspectionId={inspection.id}
          results={results}
          open={sendOpen}
          onOpenChange={setSendOpen}
        />
      )}
    </>
  );
}
