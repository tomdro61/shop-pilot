"use client";

import { useState, useTransition } from "react";
import { approveRecommendations } from "@/lib/actions/dvi";
import { Button } from "@/components/ui/button";
import { DVI_CONDITION_COLORS } from "@/lib/constants";
import { CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { DviCondition } from "@/types";

interface RecommendedResult {
  id: string;
  item_name: string;
  category_name: string;
  condition: DviCondition | null;
  recommended_description: string | null;
  recommended_price: number | null;
}

interface RecommendationApprovalProps {
  token: string;
  recommendedResults: RecommendedResult[];
}

export function RecommendationApproval({
  token,
  recommendedResults,
}: RecommendationApprovalProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(recommendedResults.map((r) => r.id))
  );
  const [isApproved, setIsApproved] = useState(false);
  const [approvalResult, setApprovalResult] = useState<{ count: number; total: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedTotal = recommendedResults
    .filter((r) => selected.has(r.id))
    .reduce((sum, r) => sum + (Number(r.recommended_price) || 0), 0);

  function handleApprove() {
    startTransition(async () => {
      const result = await approveRecommendations(token, Array.from(selected));
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setIsApproved(true);
      setApprovalResult({
        count: result.approvedCount ?? selected.size,
        total: selectedTotal,
      });
    });
  }

  if (isApproved) {
    return (
      <div className="rounded-xl bg-green-50 dark:bg-green-950/30 p-6 text-center">
        <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-600 dark:text-green-400" />
        <h3 className="text-lg font-bold text-stone-900 dark:text-stone-50">
          Services Approved
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {approvalResult?.count} service{approvalResult?.count !== 1 ? "s" : ""} approved
          {approvalResult?.total ? ` — $${approvalResult.total.toFixed(2)}` : ""}.
          We&apos;ll get started right away.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
        Recommended Services
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Select the services you&apos;d like us to perform:
      </p>

      <div className="space-y-2">
        {recommendedResults.map((item) => {
          const isSelected = selected.has(item.id);
          const condColor = item.condition ? DVI_CONDITION_COLORS[item.condition] : null;

          return (
            <label
              key={item.id}
              className={`flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-colors ${
                isSelected
                  ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/20"
                  : "border-stone-200 dark:border-stone-700"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleItem(item.id)}
                className="mt-0.5 h-5 w-5 rounded"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-stone-900 dark:text-stone-50">
                    {item.recommended_description || item.item_name}
                  </span>
                  {condColor && (
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase ${condColor.bg} ${condColor.text}`}>
                      {item.condition}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{item.category_name}</span>
              </div>
              {item.recommended_price != null && (
                <span className="text-sm font-bold text-stone-900 dark:text-stone-50 shrink-0">
                  ${Number(item.recommended_price).toFixed(2)}
                </span>
              )}
            </label>
          );
        })}
      </div>

      {/* Total + approve button */}
      <div className="mt-4 rounded-xl bg-stone-50 dark:bg-stone-800/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">
            {selected.size} service{selected.size !== 1 ? "s" : ""} selected
          </span>
          <span className="text-lg font-bold text-stone-900 dark:text-stone-50">
            ${selectedTotal.toFixed(2)}
          </span>
        </div>
        <Button
          onClick={handleApprove}
          disabled={isPending || selected.size === 0}
          className="w-full"
          size="lg"
        >
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="mr-2 h-4 w-4" />
          )}
          Approve Selected Services
        </Button>
      </div>
    </div>
  );
}
