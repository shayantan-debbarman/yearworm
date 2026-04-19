'use client';

import { useEffect, useRef, useState } from 'react';

type PlayerProps = {
  youtubeId: string | null;
  youtubeStartSec: number;
  itunesPreviewUrl: string | null;
  onFinished: () => void;
};

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  destroy: () => void;
  getPlayerState: () => number;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: Record<string, unknown>,
      ) => YTPlayer;
      PlayerState: { UNSTARTED: number; ENDED: number; PLAYING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const CLIP_MS = 15_000;
const UNSTARTED_TIMEOUT_MS = 2_000;

let ytScriptPromise: Promise<void> | null = null;
function loadYouTubeAPI(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytScriptPromise) return ytScriptPromise;
  ytScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = () => reject(new Error('Failed to load YouTube iframe API'));
      document.head.appendChild(tag);
    }
  });
  return ytScriptPromise;
}

export default function Player({
  youtubeId,
  youtubeStartSec,
  itunesPreviewUrl,
  onFinished,
}: PlayerProps) {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<'idle' | 'youtube' | 'itunes' | 'error'>('idle');
  const [remaining, setRemaining] = useState(15);

  const containerRef = useRef<HTMLDivElement>(null);
  const ytRef = useRef<YTPlayer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  const unstartedWatchdogRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
    if (unstartedWatchdogRef.current) window.clearTimeout(unstartedWatchdogRef.current);
    try { ytRef.current?.stopVideo(); } catch {}
    try { audioRef.current?.pause(); } catch {}
    onFinished();
  };

  const beginTimers = () => {
    setRemaining(15);
    stopTimerRef.current = window.setTimeout(finish, CLIP_MS);
    tickTimerRef.current = window.setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
  };

  const startItunes = () => {
    if (!itunesPreviewUrl) {
      setMode('error');
      return;
    }
    setMode('itunes');
    const audio = new Audio(itunesPreviewUrl);
    audio.preload = 'auto';
    audio.currentTime = 0;
    audioRef.current = audio;
    audio.play().then(() => beginTimers()).catch(() => setMode('error'));
  };

  const startYouTube = async () => {
    if (!youtubeId || !containerRef.current) {
      startItunes();
      return;
    }
    try {
      await loadYouTubeAPI();
    } catch {
      startItunes();
      return;
    }
    if (!window.YT || !containerRef.current) {
      startItunes();
      return;
    }

    setMode('youtube');
    const host = document.createElement('div');
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(host);

    const player = new window.YT.Player(host, {
      height: '0',
      width: '0',
      videoId: youtubeId,
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        start: youtubeStartSec,
        end: youtubeStartSec + 15,
      },
      events: {
        onReady: () => {
          try { player.playVideo(); } catch {}
          unstartedWatchdogRef.current = window.setTimeout(() => {
            const state = (() => { try { return player.getPlayerState(); } catch { return -1; } })();
            if (state !== window.YT?.PlayerState.PLAYING) {
              try { player.destroy(); } catch {}
              startItunes();
            }
          }, UNSTARTED_TIMEOUT_MS);
        },
        onStateChange: (e: { data: number }) => {
          if (e.data === window.YT?.PlayerState.PLAYING) {
            if (unstartedWatchdogRef.current) {
              window.clearTimeout(unstartedWatchdogRef.current);
              unstartedWatchdogRef.current = null;
            }
            if (!stopTimerRef.current) beginTimers();
          }
          if (e.data === window.YT?.PlayerState.ENDED) {
            finish();
          }
        },
        onError: () => {
          try { player.destroy(); } catch {}
          startItunes();
        },
      },
    });
    ytRef.current = player;
  };

  const handlePlay = () => {
    if (started) return;
    setStarted(true);
    if (youtubeId) startYouTube();
    else if (itunesPreviewUrl) startItunes();
    else setMode('error');
  };

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
      if (unstartedWatchdogRef.current) window.clearTimeout(unstartedWatchdogRef.current);
      try { ytRef.current?.destroy(); } catch {}
      try { audioRef.current?.pause(); } catch {}
    };
  }, []);

  if (!started) {
    return (
      <button
        onClick={handlePlay}
        className="w-full rounded-2xl bg-emerald-500 px-8 py-6 text-2xl font-bold text-black shadow-lg shadow-emerald-500/20 min-h-16 active:scale-[0.98] transition"
      >
        ▶  Play 15-second clip
      </button>
    );
  }

  if (mode === 'error') {
    return (
      <div className="w-full rounded-2xl bg-red-950 border border-red-700 p-6 text-center">
        <p className="text-red-200 font-semibold">Couldn&apos;t play this track.</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center gap-3">
      {/* invisible host for YT iframe */}
      <div ref={containerRef} className="sr-only" aria-hidden />
      <div className="text-6xl font-black tabular-nums">{remaining}</div>
      <p className="text-sm text-neutral-500 uppercase tracking-wide">
        {mode === 'youtube' ? 'Playing via YouTube' : 'Playing via iTunes preview'}
      </p>
    </div>
  );
}
