// @ts-nocheck
"use client";

import { useRef, useState } from "react";

export type PickerBackgroundSound = { id: string; filename: string; sizeBytes?: number | null };

function fmtSize(bytes?: number | null) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export default function BackgroundSoundPicker({
  sounds,
  currentId,
  onSelect,
  onUploaded,
  onClose,
}: {
  sounds: PickerBackgroundSound[];
  currentId?: string | null;
  onSelect: (s: PickerBackgroundSound | null) => void;
  onUploaded: (s: PickerBackgroundSound) => void;
  onClose: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true); setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/cartesia-files", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      onUploaded(data.file);
    } catch (err: any) {
      setUploadError(err?.message || "Something went wrong.");
    } finally { setUploading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="bg-raised rounded-2xl shadow-xl w-full max-w-[520px] max-h-[75vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-line flex items-center justify-between shrink-0">
          <div className="text-[15px] font-semibold">Background sound</div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div onClick={() => onSelect(null)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-paper ${!currentId ? "bg-signal-tint" : ""}`}>
            <div className="flex-1 text-[13.5px] font-semibold">None</div>
            {!currentId && <span className="text-signal">✓</span>}
          </div>
          {sounds.length === 0 && (
            <div className="text-center text-[12px] text-ink-soft py-6">No background sounds uploaded yet.</div>
          )}
          {sounds.map((s) => (
            <div key={s.id} onClick={() => onSelect(s)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-paper ${currentId === s.id ? "bg-signal-tint" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold truncate">{s.filename}</div>
                {s.sizeBytes ? <div className="text-[11px] text-ink-soft mt-0.5">{fmtSize(s.sizeBytes)}</div> : null}
              </div>
              {currentId === s.id && <span className="text-signal">✓</span>}
            </div>
          ))}
        </div>

        <div className="px-5 py-3.5 border-t border-line shrink-0 flex flex-col gap-2">
          {uploadError && <div className="text-[11.5px] text-miss">{uploadError}</div>}
          <input ref={fileInputRef} type="file" accept="audio/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="text-[12.5px] font-semibold text-signal text-left disabled:opacity-50">
            {uploading ? "Uploading…" : "+ Upload a new background track"}
          </button>
        </div>
      </div>
    </div>
  );
}
