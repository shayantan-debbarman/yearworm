import { notFound } from 'next/navigation';
import songs from '@/data/songs.json';
import PlayClient from './PlayClient';

type Song = {
  id: string;
  title: string;
  artist: string;
  year: number;
  youtubeId: string | null;
  youtubeStartSec: number;
  itunesPreviewUrl: string | null;
};

export function generateStaticParams() {
  return (songs as Song[]).map((s) => ({ id: s.id }));
}

export const dynamicParams = false;

export default function PlayPage({ params }: { params: { id: string } }) {
  const song = (songs as Song[]).find((s) => s.id === params.id);
  if (!song) notFound();
  return <PlayClient song={song} />;
}
