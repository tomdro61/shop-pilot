"use client";

import { useState } from "react";
import { Camera, X } from "lucide-react";

interface Photo {
  id: string;
  signedUrl?: string;
}

interface PhotoLightboxProps {
  photos: Photo[];
}

export function PhotoLightbox({ photos }: PhotoLightboxProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="mt-2 flex gap-2 flex-wrap">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="h-16 w-16 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800"
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
          </div>
        ))}
      </div>

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
    </>
  );
}
