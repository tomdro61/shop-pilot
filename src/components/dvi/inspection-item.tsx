"use client";

import { useState, forwardRef } from "react";
import { ConditionButtons } from "./condition-buttons";
import { PhotoUpload } from "./photo-upload";
import { Camera, MessageSquare } from "lucide-react";
import type { DviCondition } from "@/types";

interface InspectionItemProps {
  resultId: string;
  inspectionId: string;
  itemName: string;
  condition: DviCondition | null;
  note: string | null;
  photos: { id: string; storage_path: string; signedUrl?: string }[];
  onConditionChange: (resultId: string, condition: DviCondition) => void;
  onNoteChange: (resultId: string, note: string) => void;
  onPhotoUploaded: () => void;
  onPhotoDeleted: (photoId: string) => void;
  disabled?: boolean;
  isHighlighted?: boolean;
}

export const InspectionItem = forwardRef<HTMLDivElement, InspectionItemProps>(
  function InspectionItem(
    {
      resultId,
      inspectionId,
      itemName,
      condition,
      note,
      photos,
      onConditionChange,
      onNoteChange,
      onPhotoUploaded,
      onPhotoDeleted,
      disabled,
      isHighlighted,
    },
    ref
  ) {
    const [showNote, setShowNote] = useState(!!note);
    const [showPhotos, setShowPhotos] = useState(false);
    const [noteValue, setNoteValue] = useState(note || "");

    function handleNoteBlur() {
      if (noteValue !== (note || "")) {
        onNoteChange(resultId, noteValue);
      }
    }

    return (
      <div
        ref={ref}
        data-result-id={resultId}
        className={`rounded-lg p-3 transition-all ${
          isHighlighted
            ? "ring-2 ring-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
            : "bg-stone-100/50 dark:bg-stone-800/30"
        }`}
      >
        {/* Item name + condition buttons */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-stone-900 dark:text-stone-50 flex-1 min-w-0">
            {itemName}
          </p>
          <ConditionButtons
            value={condition}
            onChange={(c) => onConditionChange(resultId, c)}
            disabled={disabled}
          />
        </div>

        {/* Action buttons (note + photo) */}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setShowNote(!showNote)}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-bold uppercase transition-colors ${
              showNote || note
                ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
            }`}
          >
            <MessageSquare className="h-3 w-3" />
            Note{note ? " *" : ""}
          </button>
          <button
            type="button"
            onClick={() => setShowPhotos(!showPhotos)}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-bold uppercase transition-colors ${
              showPhotos || photos.length > 0
                ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
            }`}
          >
            <Camera className="h-3 w-3" />
            Photo{photos.length > 0 ? ` (${photos.length})` : ""}
          </button>
        </div>

        {/* Note input */}
        {showNote && (
          <div className="mt-2">
            <textarea
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              onBlur={handleNoteBlur}
              placeholder="Add a note..."
              rows={2}
              disabled={disabled}
              className="w-full rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
        )}

        {/* Photo upload */}
        {showPhotos && (
          <div className="mt-2">
            <PhotoUpload
              inspectionId={inspectionId}
              resultId={resultId}
              photos={photos}
              onUploaded={onPhotoUploaded}
              onDeleted={onPhotoDeleted}
              disabled={disabled}
            />
          </div>
        )}
      </div>
    );
  }
);
