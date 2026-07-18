"use client";

import { usePathname } from "next/navigation";
import { getDataQualityExclusion } from "@/lib/data-quality-exclusions";

export default function CompanyDataQualityWarning() {
  const pathname = usePathname();
  const match = pathname.match(/^\/company\/([^/]+)/);
  const ticker = match?.[1] ?? "";
  const exclusion = getDataQualityExclusion(ticker);

  if (!exclusion) return null;

  return (
    <div className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-3xl rounded-2xl border border-yellow-300/40 bg-[#211a05]/95 p-4 text-yellow-50 shadow-2xl shadow-black/40 backdrop-blur sm:bottom-6">
      <p className="text-sm font-black">データ品質に関する注意</p>
      <p className="mt-2 text-sm leading-6 text-yellow-100/90">{exclusion.reason}</p>
    </div>
  );
}
