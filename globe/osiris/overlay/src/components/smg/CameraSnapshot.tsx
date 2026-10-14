'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { viaOurServer } from '@/lib/camera-preview';

export interface SnapshotCamera {
  id: string;
  name?: string;
  city?: string;
  source?: string;
  feed_url?: string;
}

// Our server fetches each FDOT still at most once a minute, so asking more often adds nothing.
const REFRESH_MS = 60_000;

/**
 * A camera's current still, refreshed every minute. FDOT stills come through our server
 * (/api/smg/fdot-snapshot), not from each viewer's browser; nothing is recorded.
 */
export default function CameraSnapshot({ camera, onClose }: { camera: SnapshotCamera; onClose: () => void }) {
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState(false);

  // The parent keys this component by camera, so a new camera starts afresh.
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), REFRESH_MS);
    return () => clearInterval(t);
  }, [camera.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const base = camera.feed_url ? viaOurServer(camera.feed_url) : null;
  const src = base ? `${base}${base.includes('?') ? '&' : '?'}_=${tick}` : null;

  return (
    <div
      role="dialog"
      aria-label={camera.name ?? 'Traffic camera'}
      className="absolute bottom-4 left-4 z-[600] w-[min(92vw,420px)] rounded-lg border border-[var(--border-primary)] bg-[rgba(12,14,26,0.94)] text-[var(--text-heading)] shadow-2xl backdrop-blur"
    >
      <div className="flex items-start justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium">{camera.name ?? 'Camera'}</div>
          <div className="text-[10px] text-[var(--text-secondary)]">
            {[camera.city, camera.source === 'FDOT' ? 'FDOT · FL511' : camera.source].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close camera" className="rounded p-1 hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- a live still from the camera owner, shown as published
        <img src={src} alt={`Current view: ${camera.name ?? 'camera'}`} className="block w-full" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <p className="px-3 pb-3 text-[11px] text-[var(--text-secondary)]">This camera’s picture isn’t available right now.</p>
      )}
      <p className="px-3 py-1.5 text-[9px] text-[var(--text-secondary)]">Updates every minute.</p>
    </div>
  );
}
