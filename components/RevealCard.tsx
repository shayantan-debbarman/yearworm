'use client';

import Link from 'next/link';

type Song = {
  id: string;
  title: string;
  artist: string;
  year: number;
};

export default function RevealCard({ song }: { song: Song }) {
  return (
    <div className="w-full rounded-3xl bg-neutral-900 border border-neutral-800 p-8 flex flex-col items-center gap-6">
      <div className="text-8xl font-black tabular-nums text-emerald-400">
        {song.year}
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold leading-tight">{song.title}</div>
        <div className="text-lg text-neutral-400 mt-1">{song.artist}</div>
      </div>
      <Link
        href="/"
        className="w-full mt-2 rounded-xl bg-emerald-500 px-6 py-4 text-center text-lg font-bold text-black min-h-16 active:scale-[0.98] transition"
      >
        Scan next card
      </Link>
    </div>
  );
}
