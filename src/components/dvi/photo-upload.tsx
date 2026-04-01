"use client";

import { useRef, useState, useTransition } from "react";
import { uploadDviPhoto, deleteDviPhoto } from "@/lib/supabase/storage";
import { Camera, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DVI_MAX_PHOTOS_PER_ITEM } from "@/lib/constants";

const MAX_WIDTH = 1200;
const JPEG_QUALITY = 0.8;

interface PhotoUploadProps {
  inspectionId: string;
  resultId: string;
  photos: { id: string; storage_path: string; signedUrl?: string }[];
  onUploaded: () => void;
  onDeleted: (photoId: string) => void;
  disabled?: boolean;
}

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        if (width > MAX_WIDTH) {
          height = (height * MAX_WIDTH) / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas context failed"));

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        // Strip the data:image/jpeg;base64, prefix
        const base64 = dataUrl.split(",")[1];
        resolve(base64);
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function PhotoUpload({
  inspectionId,
  resultId,
  photos,
  onUploaded,
  onDeleted,
  disabled,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const canUpload = photos.length < DVI_MAX_PHOTOS_PER_ITEM && !disabled;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    setIsUploading(true);
    try {
      const base64 = await resizeImage(file);
      const result = await uploadDviPhoto(inspectionId, resultId, base64, file.name);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        onUploaded();
      }
    } catch {
      toast.error("Failed to upload photo");
    } finally {
      setIsUploading(false);
    }
  }

  function handleDelete(photoId: string) {
    setDeletingId(photoId);
    startTransition(async () => {
      const result = await deleteDviPhoto(photoId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        onDeleted(photoId);
      }
      setDeletingId(null);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="relative h-16 w-16 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800"
          >
            {photo.signedUrl ? (
              <img
                src={photo.signedUrl}
                alt=""
                className="h-full w-full object-cover cursor-pointer"
                onClick={() => setLightboxUrl(photo.signedUrl!)}
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Camera className="h-4 w-4 text-stone-400" />
              </div>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={() => handleDelete(photo.id)}
                disabled={deletingId === photo.id}
                className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
              >
                {deletingId === photo.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        ))}

        {canUpload && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-stone-300 dark:border-stone-600 text-stone-400 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
          >
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Camera className="h-5 w-5" />
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {photos.length >= DVI_MAX_PHOTOS_PER_ITEM && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Max {DVI_MAX_PHOTOS_PER_ITEM} photos per item
        </p>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxUrl}
            alt=""
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
