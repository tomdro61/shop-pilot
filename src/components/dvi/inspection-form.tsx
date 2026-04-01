"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CategorySection } from "./category-section";
import { InspectionItem } from "./inspection-item";
import { InspectionProgress } from "./inspection-progress";
import { updateResult, completeInspection } from "@/lib/actions/dvi";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { DviCondition } from "@/types";

interface ResultItem {
  id: string;
  category_name: string;
  item_name: string;
  condition: DviCondition | null;
  note: string | null;
  sort_order: number;
  dvi_photos: { id: string; storage_path: string; signedUrl?: string }[];
}

interface InspectionFormProps {
  inspectionId: string;
  jobId: string;
  results: ResultItem[];
  photoUrls: Record<string, string>;
  vehicleDesc: string;
  isCompleted: boolean;
}

// Group results by category, preserving sort order
function groupByCategory(results: ResultItem[]) {
  const groups: { name: string; items: ResultItem[] }[] = [];
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

export function InspectionForm({
  inspectionId,
  jobId,
  results: initialResults,
  photoUrls,
  vehicleDesc,
  isCompleted,
}: InspectionFormProps) {
  const router = useRouter();
  const [results, setResults] = useState(initialResults);
  const [isCompleting, startCompleting] = useTransition();
  const [, startSaving] = useTransition();
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Sync photos from server when props change (after router.refresh)
  useEffect(() => {
    setResults((prev) =>
      prev.map((r) => {
        const fresh = initialResults.find((ir) => ir.id === r.id);
        if (!fresh) return r;
        return { ...r, dvi_photos: fresh.dvi_photos };
      })
    );
  }, [initialResults]);

  // Attach signed URLs to photos
  const resultsWithUrls = results.map((r) => ({
    ...r,
    dvi_photos: r.dvi_photos.map((p) => ({
      ...p,
      signedUrl: photoUrls[p.storage_path],
    })),
  }));

  const categories = groupByCategory(resultsWithUrls);
  const rated = results.filter((r) => r.condition !== null).length;
  const total = results.length;
  const allRated = rated === total && total > 0;

  // Find first unrated item
  const findFirstUnrated = useCallback(() => {
    return results.find((r) => r.condition === null);
  }, [results]);

  // Auto-scroll to first unrated on mount
  useEffect(() => {
    if (isCompleted) return;
    const timer = setTimeout(() => {
      const unrated = findFirstUnrated();
      if (unrated) {
        scrollToItem(unrated.id);
      }
    }, 300);
    return () => clearTimeout(timer);
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scrollToItem(resultId: string) {
    const el = itemRefs.current.get(resultId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(resultId);
      setTimeout(() => setHighlightedId(null), 2000);
    }
  }

  function handleJumpToNext() {
    const unrated = findFirstUnrated();
    if (unrated) {
      scrollToItem(unrated.id);
    }
  }

  function handleConditionChange(resultId: string, condition: DviCondition) {
    // Optimistic update
    setResults((prev) =>
      prev.map((r) => (r.id === resultId ? { ...r, condition } : r))
    );

    // Persist
    startSaving(async () => {
      const result = await updateResult(resultId, { condition });
      if ("error" in result) {
        // Rollback
        setResults((prev) =>
          prev.map((r) =>
            r.id === resultId
              ? { ...r, condition: initialResults.find((ir) => ir.id === resultId)?.condition ?? null }
              : r
          )
        );
        toast.error("Failed to save");
      }
    });
  }

  function handleNoteChange(resultId: string, note: string) {
    setResults((prev) =>
      prev.map((r) => (r.id === resultId ? { ...r, note: note || null } : r))
    );

    startSaving(async () => {
      const result = await updateResult(resultId, { note: note || null });
      if ("error" in result) {
        toast.error("Failed to save note");
      }
    });
  }

  function handlePhotoUploaded() {
    router.refresh();
  }

  function handlePhotoDeleted(photoId: string) {
    setResults((prev) =>
      prev.map((r) => ({
        ...r,
        dvi_photos: r.dvi_photos.filter((p) => p.id !== photoId),
      }))
    );
  }

  function handleComplete() {
    startCompleting(async () => {
      const result = await completeInspection(inspectionId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Inspection completed!");
      router.push(`/dvi/${jobId}`);
    });
  }

  // Ref callback for item elements
  const setItemRef = useCallback((resultId: string, el: HTMLDivElement | null) => {
    if (el) {
      itemRefs.current.set(resultId, el);
    } else {
      itemRefs.current.delete(resultId);
    }
  }, []);

  return (
    <div className="pb-24">
      {/* Sticky header with progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => router.push(`/dvi/${jobId}`)}
            className="flex items-center gap-1.5 rounded-full bg-stone-100 dark:bg-stone-800 px-3 py-1.5 text-sm font-medium text-stone-700 dark:text-stone-300 active:scale-95 transition-transform"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h2 className="text-sm font-bold text-stone-900 dark:text-stone-50 truncate ml-3">
            {vehicleDesc}
          </h2>
        </div>
        <InspectionProgress
          rated={rated}
          total={total}
          onJumpToNext={handleJumpToNext}
          hasUnrated={!allRated && !isCompleted}
        />
      </div>

      {/* Category sections */}
      <div className="mt-4 space-y-3">
        {categories.map((cat, catIdx) => {
          const catRated = cat.items.filter((i) => i.condition !== null).length;
          // Auto-open the first category with unrated items
          const hasUnrated = cat.items.some((i) => i.condition === null);
          const defaultOpen = catIdx === 0 || (hasUnrated && categories.slice(0, catIdx).every(
            (prev) => prev.items.every((i) => i.condition !== null)
          ));

          return (
            <CategorySection
              key={cat.name}
              name={cat.name}
              ratedCount={catRated}
              totalCount={cat.items.length}
              defaultOpen={defaultOpen}
            >
              {cat.items.map((item) => (
                <InspectionItem
                  key={item.id}
                  ref={(el) => setItemRef(item.id, el)}
                  resultId={item.id}
                  inspectionId={inspectionId}
                  itemName={item.item_name}
                  condition={item.condition}
                  note={item.note}
                  photos={item.dvi_photos}
                  onConditionChange={handleConditionChange}
                  onNoteChange={handleNoteChange}
                  onPhotoUploaded={handlePhotoUploaded}
                  onPhotoDeleted={handlePhotoDeleted}
                  disabled={isCompleted}
                  isHighlighted={highlightedId === item.id}
                />
              ))}
            </CategorySection>
          );
        })}
      </div>

      {/* Complete button */}
      {!isCompleted && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-stone-200 dark:border-stone-800 bg-background p-4">
          <div className="mx-auto max-w-2xl">
            <Button
              onClick={handleComplete}
              disabled={!allRated || isCompleting}
              className="w-full"
              size="lg"
            >
              {isCompleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              {allRated
                ? "Complete Inspection"
                : `${total - rated} item${total - rated !== 1 ? "s" : ""} remaining`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
