"use client";

import { useId, useState } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import type { PhotoLine } from "@/lib/types";
import { uid } from "@/lib/calc";
import { Input, Modal, downscale } from "./ui";

/**
 * Any number of named attachments on an entry — POD, weighment slip, damage
 * photo. The name is editable so the file means something later.
 */
export function PhotoLines({
  value,
  onChange,
}: {
  value: PhotoLine[];
  onChange: (photos: PhotoLine[]) => void;
}) {
  const inputId = useId();
  const photos = value ?? [];
  const [viewing, setViewing] = useState<PhotoLine | null>(null);
  const [busy, setBusy] = useState(false);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const added: PhotoLine[] = [];
      for (const file of Array.from(files)) {
        const src = await downscale(file, 1400, 0.75);
        // Default the name to the file name, minus its extension.
        const name = file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Photo";
        added.push({ id: uid(), name, src });
      }
      onChange([...photos, ...added]);
    } finally {
      setBusy(false);
    }
  }

  const rename = (id: string, name: string) =>
    onChange(photos.map((p) => (p.id === id ? { ...p, name } : p)));
  const remove = (id: string) => onChange(photos.filter((p) => p.id !== id));

  return (
    <div className="rounded-xl border border-navy-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-navy-900">Photos</h3>
          <p className="text-xs text-navy-500">
            Acknowledgment, weighment slip, anything. Name each one.
          </p>
        </div>
        <label htmlFor={inputId} className="btn-ghost btn-sm cursor-pointer">
          <ImagePlus size={14} /> {busy ? "Adding…" : "Add photos"}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {photos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-navy-200 py-6 text-center text-xs text-navy-400">
          No photos attached.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-lg border border-navy-200">
              <button
                type="button"
                onClick={() => setViewing(p)}
                className="block w-full"
                title="View full size"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.src}
                  alt={p.name}
                  className="aspect-[4/3] w-full object-cover transition hover:opacity-90"
                />
              </button>
              <div className="flex items-center gap-1 border-t border-navy-100 p-1.5">
                <Input
                  value={p.name}
                  onChange={(e) => rename(p.id, e.target.value)}
                  placeholder="Name this photo"
                  className="min-w-0 flex-1 !py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="shrink-0 rounded-md p-1.5 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove ${p.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.name || "Photo"}
        wide
      >
        {viewing && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={viewing.src} alt={viewing.name} className="w-full rounded-lg" />
        )}
      </Modal>
    </div>
  );
}

/** Read-only strip used on list pages. */
export function PhotoStrip({ photos }: { photos: PhotoLine[] }) {
  const [viewing, setViewing] = useState<PhotoLine | null>(null);
  if (!photos?.length) return null;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((p) => (
          <button
            key={p.id}
            onClick={() => setViewing(p)}
            className="overflow-hidden rounded-lg border border-navy-200 text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.src} alt={p.name} className="aspect-[4/3] w-full object-cover" />
            <p className="truncate px-2 py-1.5 text-[11px] font-semibold text-navy-700">
              {p.name}
            </p>
          </button>
        ))}
      </div>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name || ""} wide>
        {viewing && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={viewing.src} alt={viewing.name} className="w-full rounded-lg" />
        )}
      </Modal>
    </>
  );
}

export { X };
