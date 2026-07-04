export default function CompanyLoading() {
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-10 w-48 rounded-xl bg-white/10" />

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_420px]">
          <div className="h-80 rounded-3xl bg-white/10" />
          <div className="h-80 rounded-3xl bg-white/10" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="h-52 rounded-3xl bg-white/10" />
          <div className="h-52 rounded-3xl bg-white/10" />
          <div className="h-52 rounded-3xl bg-white/10" />
        </div>

        <div className="mt-6 h-72 rounded-3xl bg-white/10" />
      </div>
    </main>
  );
}