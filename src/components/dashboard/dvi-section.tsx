"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
      <Card className="py-0 gap-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 bg-sidebar px-5 py-3">
          <CardTitle className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-stone-100">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Vehicle Inspection
          </CardTitle>
          {status && statusColors && (
            <Badge variant="outline" className={`${statusColors.bg} ${statusColors.text}`}>
              {DVI_STATUS_LABELS[status]}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="py-4">
          {!inspection ? (
            <p className="text-sm text-muted-foreground py-2 text-center">
              No inspection yet — tech will start from their portal.
            </p>
          ) : status === "in_progress" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{counts.rated}/{counts.total} items</span>
              </div>
              <div className="h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: counts.total > 0 ? `${(counts.rated / counts.total) * 100}%` : "0%" }}
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Started</span>
                <span>{formatDate(inspection.created_at)}</span>
              </div>
            </div>
          ) : status === "completed" ? (
            <div className="space-y-3">
              {/* Condition summary */}
              <div className="flex gap-3">
                {(["good", "monitor", "attention"] as const).map((c) => (
                  <div key={c} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-black uppercase ${DVI_CONDITION_COLORS[c].bg} ${DVI_CONDITION_COLORS[c].text}`}>
                    {counts[c]} {c === "good" ? "Good" : c === "monitor" ? "Monitor" : "Attention"}
                  </div>
                ))}
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Completed</span>
                <span>{inspection.completed_at ? formatDate(inspection.completed_at) : "—"}</span>
              </div>

              <div className="flex gap-2">
                <a href={`/jobs/${jobId}/dvi`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <Eye className="mr-2 h-4 w-4" />
                    View Report
                  </Button>
                </a>
                <Button size="sm" onClick={() => setSendOpen(true)}>
                  <Send className="mr-2 h-4 w-4" />
                  Send to Customer
                </Button>
              </div>
            </div>
          ) : status === "sent" ? (
            <div className="space-y-2">
              {/* Condition summary */}
              <div className="flex gap-3">
                {(["good", "monitor", "attention"] as const).map((c) => (
                  <div key={c} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-black uppercase ${DVI_CONDITION_COLORS[c].bg} ${DVI_CONDITION_COLORS[c].text}`}>
                    {counts[c]} {c === "good" ? "Good" : c === "monitor" ? "Monitor" : "Attention"}
                  </div>
                ))}
              </div>

              <p className="text-sm text-muted-foreground">
                Sent {inspection.sent_at ? formatDate(inspection.sent_at) : ""}
              </p>

              <div className="flex gap-2">
                <a href={`/jobs/${jobId}/dvi`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <Eye className="mr-2 h-4 w-4" />
                    View Report
                  </Button>
                </a>
                {inspection.approval_token && (
                  <a href={`${appUrl}/inspect/${inspection.approval_token}`} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Customer Link
                    </Button>
                  </a>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

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
