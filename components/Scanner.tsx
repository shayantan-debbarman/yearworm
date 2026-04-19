'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const SCANNER_ID = 'yearworm-scanner';

// Match both fully-qualified URLs and relative paths containing /play/<id>.
function extractPlayId(decoded: string): string | null {
  const m = decoded.match(/\/play\/(\d{1,3})(?:[\/?#]|$)/);
  if (!m) return null;
  return m[1].padStart(3, '0');
}

export default function Scanner({ onStop }: { onStop: () => void }) {
  const router = useRouter();
  const elRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled || !elRef.current) return;

        const instance = new Html5Qrcode(SCANNER_ID);
        scannerRef.current = instance as unknown as typeof scannerRef.current;

        await instance.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (handled.current) return;
            const id = extractPlayId(decoded);
            if (!id) return;
            handled.current = true;
            instance
              .stop()
              .catch(() => {})
              .finally(() => router.push(`/play/${id}`));
          },
          () => {
            /* ignore per-frame decode failures */
          },
        );
      } catch (err) {
        setError((err as Error).message ?? 'Camera unavailable');
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop()
          .catch(() => {})
          .finally(() => s.clear());
      }
    };
  }, [router]);

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div
        id={SCANNER_ID}
        ref={elRef}
        className="w-full aspect-square overflow-hidden rounded-2xl bg-neutral-900 border border-neutral-800"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={onStop}
        className="w-full rounded-xl bg-neutral-800 px-6 py-4 text-lg font-semibold min-h-16 active:scale-[0.98]"
      >
        Cancel
      </button>
    </div>
  );
}
