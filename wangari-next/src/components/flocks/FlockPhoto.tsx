"use client";

import * as React from "react";
import { Camera, X, Upload, Image } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api-client";

interface FlockPhotoProps {
  flockId: number;
  photoUrl: string | null;
  onPhotoUpdate: (url: string | null) => void;
  size?: "sm" | "md" | "lg";
  /**
   * Id for the hidden file input, so a caller can open the picker itself.
   * The setup checklist's "Take a photo of your setup" step does exactly that;
   * `.click()` on a `display:none` file input still opens the dialog, and the
   * tap that started it is the user gesture browsers require.
   */
  inputId?: string;
}

export function FlockPhoto({ flockId, photoUrl, onPhotoUpdate, size = "md", inputId }: FlockPhotoProps) {
  const [uploading, setUploading] = React.useState(false);
  const [preview, setPreview] = React.useState(photoUrl);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setPreview(photoUrl);
  }, [photoUrl]);

  const sizeClasses = {
    sm: "h-16 w-16",
    md: "h-32 w-32",
    // "lg" is a size name, not a breakpoint. On a phone the header row has to
    // fit the photo, the name and five action buttons; at a fixed 192px the
    // photo alone pushed Record/Batch/Export/Edit/Delete off the right edge,
    // where the page does not scroll sideways and so they could never be
    // tapped. Shrink it on small screens and let it grow into the space.
    lg: "h-24 w-24 sm:h-32 sm:w-32 md:h-48 md:w-48",
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const result = await api.upload(`/api/flocks/${flockId}/photo`, formData);
      if (result?.photoUrl) {
        setPreview(result.photoUrl);
        onPhotoUpdate(result.photoUrl);
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleRemove = async () => {
    try {
      await api.delete(`/api/flocks/${flockId}/photo`);
      setPreview(null);
      onPhotoUpdate(null);
    } catch (err) {
      console.error("Remove failed:", err);
    }
  };

  return (
    <div className={cn("relative group", sizeClasses[size])}>
      {preview ? (
        <>
          <img
            src={preview.startsWith("/") ? `${process.env.NEXT_PUBLIC_API_URL || "https://api.wangari.imeantech.com"}${preview}` : preview}
            alt="Flock photo"
            className="h-full w-full object-cover rounded-2xl"
          />
          <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg bg-white/90 text-wangari-gray-700 hover:bg-white cursor-pointer"
            >
              <Camera className="h-4 w-4" />
            </button>
            <button
              onClick={handleRemove}
              className="p-2 rounded-lg bg-white/90 text-wangari-red-500 hover:bg-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={cn(
            "h-full w-full rounded-2xl border-2 border-dashed border-wangari-border hover:border-wangari-green-400 hover:bg-wangari-green-50/50 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer",
            uploading && "opacity-50"
          )}
        >
          {uploading ? (
            <div className="h-6 w-6 rounded-full border-2 border-wangari-green-200 border-t-emerald-600 animate-spin" />
          ) : (
            <>
              <div className="h-10 w-10 rounded-xl bg-wangari-green-50 flex items-center justify-center">
                <Upload className="h-5 w-5 text-wangari-green-600" />
              </div>
              <span className="text-[10px] font-medium text-wangari-gray-400">
                {size === "sm" ? "Photo" : "Upload Photo"}
              </span>
            </>
          )}
        </button>
      )}

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
