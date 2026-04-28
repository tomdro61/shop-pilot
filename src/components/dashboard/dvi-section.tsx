"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MiniStatusCard, ACCENT_PILL } from "@/components/ui/mini-status-card";
import { DVI_STATUS_LABELS, DVI_CONDITION_COLORS } from "@/lib/constants";
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

export function DviSection({ jobId, inspection }: DviSectionProps) {
  const [sendOpen, setSendOpen] = useState(false);

  const status = inspection?.status as DviStatus | undefined;
  const results = inspection?.dvi_results ?? [];

  const counts = { good: 0, monitor: 0, attention: 0, total: results.length, rated: 0 };
  for (const r of results) {
    if (r.condition === "good") { counts.good++; counts.rated++; }
    else if (r.condition === "monitor") { counts.monitor++; counts.rated++; }
    else if (r.condition === "attention") { counts.attention++; counts.rated++; }
  }

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  const conditionChips = (
    <span className="flex items-center gap-1.5 flex-wrap">
      {(["good", "monitor", "attention"] as const).map((c) =>
        counts[c] > 0 ? (
          <span
            key={c}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${DVI_CONDITION_COLORS[c].bg} ${DVI_CONDITION_COLORS[c].text}`}
          >
            <span className="font-mono tabular-nums">{counts[c]}</span>
            <span className="capitalize">{c}</span>
          </span>
        ) : null
      )}
    </span>
  );

  const viewReportButton = (
    <a href={`/jobs/${jobId}/dvi`}>
      <Button variant="outline" size="sm">
        <Eye className="mr-1.5 h-3.5 w-3.5" />
        View
      </Button>
    </a>
  );

  if (!inspection) {
    return (
      <MiniStatusCard
        accent="stone"
        icon={<ClipboardCheck className="h-4 w-4" />}
        title={
          <>
            <span>Vehicle Inspection</span>
            <span className="text-xs font-normal text-stone-500 dark:text-stone-400">
              No inspection started yet
            </span>
          </>
        }
        meta="Tech will start from their portal"
      />
    );
  }

  if (status === "in_progress") {
    const pct = counts.total > 0 ? Math.round((counts.rated / counts.total) * 100) : 0;
    return (
      <MiniStatusCard
        accent="blue"
        icon={<ClipboardCheck className="h-4 w-4" />}
        title={
          <>
            <span>Vehicle Inspection</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${ACCENT_PILL.blue}`}>
              {DVI_STATUS_LABELS.in_progress}
            </span>
          </>
        }
        meta={
          <>
            <span className="font-mono tabular-nums">
              {counts.rated}/{counts.total} rated · {pct}%
            </span>
            <span>Started {formatDate(inspection.created_at)}</span>
          </>
        }
        actions={viewReportButton}
      />
    );
  }

  if (status === "completed") {
    return (
      <>
        <MiniStatusCard
          accent="amber"
          icon={<ClipboardCheck className="h-4 w-4" />}
          title={
            <>
              <span>Vehicle Inspection</span>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${ACCENT_PILL.amber}`}>
                {DVI_STATUS_LABELS.completed}
              </span>
            </>
          }
          meta={
            <>
              {conditionChips}
              {inspection.completed_at && (
                <span>Completed {formatDate(inspection.completed_at)}</span>
              )}
            </>
          }
          actions={
            <>
              {viewReportButton}
              <Button size="sm" onClick={() => setSendOpen(true)}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                Send
              </Button>
            </>
          }
        />
        <SendDviDialog
          inspectionId={inspection.id}
          results={results}
          open={sendOpen}
          onOpenChange={setSendOpen}
        />
      </>
    );
  }

  if (status === "sent") {
    return (
      <MiniStatusCard
        accent="green"
        icon={<ClipboardCheck className="h-4 w-4" />}
        title={
          <>
            <span>Vehicle Inspection</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${ACCENT_PILL.green}`}>
              {DVI_STATUS_LABELS.sent}
            </span>
          </>
        }
        meta={
          <>
            {conditionChips}
            {inspection.sent_at && <span>Sent {formatDate(inspection.sent_at)}</span>}
          </>
        }
        actions={
          <>
            {viewReportButton}
            {inspection.approval_token && (
              <a
                href={`${appUrl}/inspect/${inspection.approval_token}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Link
                </Button>
              </a>
            )}
          </>
        }
      />
    );
  }

  if (status === "approved") {
    return (
      <MiniStatusCard
        accent="green"
        icon={<ClipboardCheck className="h-4 w-4" />}
        title={
          <>
            <span>Vehicle Inspection</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${ACCENT_PILL.green}`}>
              {DVI_STATUS_LABELS.approved}
            </span>
          </>
        }
        meta={conditionChips}
        actions={viewReportButton}
      />
    );
  }

  return null;
}
