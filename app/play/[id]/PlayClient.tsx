'use client';

import { useState } from 'react';
import Link from 'next/link';
import Player from '@/components/Player';
import RevealCard from '@/components/RevealCard';

type Song = {
  id: string;
  title: string;
  artist: string;
  year: number;
  youtubeId: string | null;
  youtubeStartSec: number;
  itunesPreviewUrl: string | null;
};

export default function PlayClient({ song }: { song: Song }) {
  const [phase, setPhase] = useState<'ready' | 'playing' | 'done' | 'revealed'>('ready');

  return (
    <main className="flex min-h-screen flex-col items-center justify-between px-6 py-10">
      <header className="w-full max-w-md flex items-center justify-between text-sm text-neutral-500">
        <Link href="/" className="hover:text-neutral-300">← Home</Link>
        <span className="tabular-nums">#{song.id}</span>
      </header>

      <div className="w-full max-w-md flex flex-col items-center gap-10 flex-1 justify-center">
        {phase === 'revealed' ? (
          <RevealCard song={song} />
        ) : phase === 'done' ? (
          <button
            onClick={() => setPhase('revealed')}
            className="w-full rounded-2xl bg-emerald-500 px-8 py-6 text-2xl font-bold text-black shadow-lg shadow-emerald-500/20 min-h-16 active:scale-[0.98] transition"
          >
            Reveal
          </button>
        ) : (
          <Player
            youtubeId={song.youtubeId}
            youtubeStartSec={song.youtubeStartSec}
            itunesPreviewUrl={song.itunesPreviewUrl}
            onFinished={() => setPhase('done')}
          />
        )}
      </div>

      <div className="h-4" />
    </main>
  );
}
