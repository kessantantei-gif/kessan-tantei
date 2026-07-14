import Link from "next/link";

const links = [
  ["管理トップ", "/admin"],
  ["ユーザー", "/admin/users"],
  ["掲示板投稿", "/admin/comments"],
  ["通報", "/admin/reports"],
  ["会社マスタ", "/admin/company-master"],
  ["分析・データ", "/admin/operations"],
  ["売上・会員", "/admin/billing"],
  ["集客・転換", "/admin/acquisition"],
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="sticky top-0 z-50 overflow-x-auto border-b border-white/10 bg-[#050816]/95 px-4 py-3 text-white backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center gap-2">
          {links.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-slate-300 transition hover:border-violet-300/40 hover:text-white"
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>
      {children}
    </>
  );
}
