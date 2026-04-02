import { DVI_CONDITION_LABELS, DVI_CONDITION_COLORS } from "@/lib/constants";
import { PhotoLightbox } from "./photo-lightbox";
import type { DviCondition } from "@/types";

interface SummaryResult {
  id: string;
  category_name: string;
  item_name: string;
  condition: DviCondition | null;
  note: string | null;
  is_recommended: boolean;
  recommended_description: string | null;
  recommended_price: number | null;
  photos: { id: string; signedUrl?: string }[];
}

interface InspectionSummaryProps {
  results: SummaryResult[];
  showRecommendations?: boolean;
}

function groupByCategory(results: SummaryResult[]) {
  const groups: { name: string; items: SummaryResult[] }[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    if (!seen.has(r.category_name)) {
      seen.add(r.category_name);
      groups.push({ name: r.category_name, items: [] });
    }
    groups.find((g) => g.name === r.category_name)!.items.push(r);
  }
  return groups;
}

export function InspectionSummary({ results, showRecommendations }: InspectionSummaryProps) {
  const categories = groupByCategory(results);

  // Overall counts
  const counts = { good: 0, monitor: 0, attention: 0 };
  for (const r of results) {
    if (r.condition === "good") counts.good++;
    else if (r.condition === "monitor") counts.monitor++;
    else if (r.condition === "attention") counts.attention++;
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex gap-3 flex-wrap">
        {(["good", "monitor", "attention"] as const).map((c) => (
          <div
            key={c}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black uppercase ${DVI_CONDITION_COLORS[c].bg} ${DVI_CONDITION_COLORS[c].text}`}
          >
            {counts[c]} {DVI_CONDITION_LABELS[c]}
          </div>
        ))}
      </div>

      {/* Categories */}
      {categories.map((cat) => (
        <div key={cat.name} className="rounded-xl bg-card shadow-card ring-1 ring-stone-200/10 dark:ring-stone-700/20 overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-800 dark:bg-stone-900">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-100">
              {cat.name}
            </h4>
          </div>
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {cat.items.map((item) => {
              const condColor = item.condition ? DVI_CONDITION_COLORS[item.condition] : null;

              return (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-stone-900 dark:text-stone-50">
                      {item.item_name}
                    </span>
                    {item.condition && condColor && (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase shrink-0 ${condColor.bg} ${condColor.text}`}>
                        {DVI_CONDITION_LABELS[item.condition]}
                      </span>
                    )}
                  </div>

                  {item.note && (
                    <p className="mt-1 text-xs text-muted-foreground italic">
                      {item.note}
                    </p>
                  )}

                  {showRecommendations && item.is_recommended && (
                    <div className="mt-1.5 rounded bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 text-xs">
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        Recommended:
                      </span>{" "}
                      {item.recommended_description}
                      {item.recommended_price != null && (
                        <span className="ml-1 font-bold">
                          — ${Number(item.recommended_price).toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}

                  <PhotoLightbox photos={item.photos} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
