import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center gap-6">
      <h1 className="text-3xl font-bold">Card not found</h1>
      <p className="text-neutral-400">That QR code doesn&apos;t match any Yearworm card.</p>
      <Link href="/" className="rounded-xl bg-emerald-500 px-6 py-4 text-black font-bold">
        Go home
      </Link>
    </main>
  );
}
