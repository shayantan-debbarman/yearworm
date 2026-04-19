'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

const Scanner = dynamic(() => import('@/components/Scanner'), { ssr: false });

export default function HomePage() {
  const [scanning, setScanning] = useState(false);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md flex flex-col items-center gap-10">
        <header className="text-center">
          <h1 className="text-5xl font-black tracking-tight">Yearworm</h1>
          <p className="mt-3 text-neutral-400">Scan a card. Guess the year.</p>
        </header>

        {scanning ? (
          <Scanner onStop={() => setScanning(false)} />
        ) : (
          <button
            onClick={() => setScanning(true)}
            className="w-full rounded-2xl bg-emerald-500 px-8 py-6 text-2xl font-bold text-black shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition min-h-16"
          >
            Scan a card
          </button>
        )}

        <p className="text-center text-sm text-neutral-500">
          Tip: your phone&apos;s camera app can scan the QR directly — no need to open this first.
        </p>
      </div>
    </main>
  );
}
