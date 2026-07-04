export default function Loading() {
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="h-32 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
        <div className="mt-6 space-y-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/5"
            />
          ))}
        </div>
      </div>
    </main>
  );
}