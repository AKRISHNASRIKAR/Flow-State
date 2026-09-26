import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold text-indigo-400">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">There’s nothing at this address</h1>
      <p className="mt-2 text-sm text-neutral-300">The link may be old, or the page was moved.</p>
      <Link
        href="/workflows"
        className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Go to workflows
      </Link>
    </div>
  );
}
