import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error - yt-search has no bundled types
import ytSearch from "yt-search";

const __dirname =
  typeof import.meta.url === "string"
    ? dirname(fileURLToPath(import.meta.url))
    : (globalThis as { __dirname?: string }).__dirname ?? process.cwd();

type SeedSong = { id: string; title: string; artist: string; year: number };
type Song = SeedSong & {
  youtubeId: string | null;
  youtubeStartSec: number;
  itunesPreviewUrl: string | null;
};

const ROOT = resolve(__dirname, "..");
const SEED_PATH = resolve(ROOT, "data/songs.seed.json");
const OUT_PATH = resolve(ROOT, "data/songs.json");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseDurationSec(timestamp: string | undefined): number | null {
  if (!timestamp) return null;
  const parts = timestamp.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function scoreVideo(
  v: { title: string; author?: { name?: string }; seconds?: number },
  song: SeedSong,
): number {
  const t = v.title.toLowerCase();
  const artistLc = song.artist.toLowerCase();
  const titleLc = song.title.toLowerCase();
  let score = 0;
  if (t.includes(titleLc)) score += 5;
  if (t.includes(artistLc.split(/\s|&|ft\.|feat/)[0])) score += 3;
  if (v.author?.name?.toLowerCase().includes(artistLc.split(/\s|&|ft\.|feat/)[0])) score += 3;
  if (t.includes("official")) score += 2;
  if (t.includes("audio")) score += 1;
  if (t.includes("lyrics")) score -= 1;
  if (t.includes("cover")) score -= 5;
  if (t.includes("live")) score -= 2;
  if (t.includes("remix") && !titleLc.includes("remix")) score -= 3;
  if (t.includes("karaoke")) score -= 5;
  if (t.includes("reaction")) score -= 5;
  const secs = v.seconds ?? 0;
  if (secs > 60 && secs < 600) score += 1;
  if (secs > 1800) score -= 5;
  return score;
}

async function findYouTubeOnce(
  song: SeedSong,
  query: string,
): Promise<{ id: string; durationSec: number | null } | null> {
  const res = await ytSearch(query);
  const videos = (res?.videos ?? []) as Array<{
    videoId: string;
    title: string;
    author?: { name?: string };
    seconds?: number;
    timestamp?: string;
  }>;
  if (videos.length === 0) return null;
  const ranked = videos
    .slice(0, 10)
    .map((v) => ({ v, score: scoreVideo(v, song) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0]?.v;
  if (!best) return null;
  const durationSec = best.seconds ?? parseDurationSec(best.timestamp);
  return { id: best.videoId, durationSec };
}

async function findYouTube(
  song: SeedSong,
): Promise<{ id: string; durationSec: number | null } | null> {
  const queries = [
    `${song.artist} ${song.title} official audio`,
    `${song.artist} ${song.title}`,
    `${song.title} ${song.artist}`,
  ];
  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const q = queries[Math.min(attempt, queries.length - 1)];
    try {
      const r = await findYouTubeOnce(song, q);
      if (r) return r;
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      const wait = 1500 * Math.pow(2, attempt);
      console.warn(`    yt attempt ${attempt + 1} failed (${msg || "undefined"}), backing off ${wait}ms`);
      await sleep(wait);
    }
  }
  return null;
}

async function findItunesPreview(song: SeedSong): Promise<string | null> {
  try {
    const term = encodeURIComponent(`${song.artist} ${song.title}`);
    const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        previewUrl?: string;
        trackName?: string;
        artistName?: string;
      }>;
    };
    const results = data.results ?? [];
    if (results.length === 0) return null;
    const artistLc = song.artist.toLowerCase().split(/\s|&|ft\.|feat/)[0];
    const titleLc = song.title.toLowerCase();
    const match =
      results.find(
        (r) =>
          r.artistName?.toLowerCase().includes(artistLc) &&
          r.trackName?.toLowerCase().includes(titleLc),
      ) ?? results[0];
    return match.previewUrl ?? null;
  } catch (err) {
    console.warn(`  iTunes error for ${song.artist} - ${song.title}:`, (err as Error).message);
    return null;
  }
}

async function main() {
  const seed: SeedSong[] = JSON.parse(await readFile(SEED_PATH, "utf8"));
  let existing: Song[] = [];
  try {
    existing = JSON.parse(await readFile(OUT_PATH, "utf8"));
  } catch {
    /* no existing file */
  }
  const byId = new Map(existing.map((s) => [s.id, s]));

  const todo: SeedSong[] = [];
  const out: Song[] = [];
  for (const s of seed) {
    const cur = byId.get(s.id);
    const titleChanged =
      !cur || cur.title !== s.title || cur.artist !== s.artist || cur.year !== s.year;
    const needsYT = !cur?.youtubeId;
    const needsIT = !cur?.itunesPreviewUrl;
    if (titleChanged || needsYT || needsIT) {
      todo.push(s);
      // placeholder; will be replaced after fetch
      out.push({
        ...s,
        youtubeId: titleChanged ? null : cur?.youtubeId ?? null,
        youtubeStartSec: cur?.youtubeStartSec ?? 30,
        itunesPreviewUrl: titleChanged ? null : cur?.itunesPreviewUrl ?? null,
      });
    } else {
      out.push(cur);
    }
  }

  console.log(`Refreshing ${todo.length}/${seed.length} entries...`);

  const outById = new Map(out.map((s) => [s.id, s]));
  let i = 0;
  for (const s of todo) {
    i++;
    process.stdout.write(`[${i}/${todo.length}] ${s.id} ${s.artist} - ${s.title} ... `);
    const cur = outById.get(s.id)!;
    const needsYT = !cur.youtubeId;
    const needsIT = !cur.itunesPreviewUrl;

    const [yt, preview] = await Promise.all([
      needsYT ? findYouTube(s) : Promise.resolve(null),
      needsIT ? findItunesPreview(s) : Promise.resolve(null),
    ]);

    const duration = yt?.durationSec ?? null;
    const youtubeStartSec =
      duration !== null && duration < 120 ? 15 : cur.youtubeStartSec || 30;

    const updated: Song = {
      ...s,
      youtubeId: yt?.id ?? cur.youtubeId,
      youtubeStartSec,
      itunesPreviewUrl: preview ?? cur.itunesPreviewUrl,
    };
    outById.set(s.id, updated);

    const flags = [
      updated.youtubeId ? "YT" : "--",
      updated.itunesPreviewUrl ? "iT" : "--",
    ].join(" ");
    console.log(flags);

    await sleep(500);
  }

  const final: Song[] = seed.map((s) => outById.get(s.id)!);
  await writeFile(OUT_PATH, JSON.stringify(final, null, 2) + "\n", "utf8");

  const ytCount = final.filter((s) => s.youtubeId).length;
  const itCount = final.filter((s) => s.itunesPreviewUrl).length;
  const both = final.filter((s) => s.youtubeId && s.itunesPreviewUrl).length;
  const missing = final.filter((s) => !s.youtubeId && !s.itunesPreviewUrl);
  console.log(`\nWrote ${final.length} songs to ${OUT_PATH}`);
  console.log(`YouTube hits : ${ytCount}/${final.length}`);
  console.log(`iTunes hits  : ${itCount}/${final.length}`);
  console.log(`Both sources : ${both}/${final.length}`);
  if (missing.length > 0) {
    console.log(`\n${missing.length} songs missing BOTH sources:`);
    for (const m of missing) console.log(`  ${m.id}  ${m.artist} - ${m.title} (${m.year})`);
  } else {
    console.log("\nAll songs have at least one source.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
