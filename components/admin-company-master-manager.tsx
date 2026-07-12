"use client";

import { useMemo, useState } from "react";

type CompanyMasterEntry = {
  ticker: string;
  companyName: string;
  theme: string;
  themeId: string;
  subTheme: string;
  businessModel: string;
  marketCapClass: string | null;
  rivalTickers: string[];
  keywords: string[];
  reviewed: boolean;
  source: "curated" | "automatic";
  updatedAt: string | null;
};

type Props = {
  initialEntries: CompanyMasterEntry[];
};

type Filter = "all" | "reviewed" | "automatic" | "unclassified";

function splitList(value: string) {
  return [...new Set(value.split(/[\s,、]+/).map((item) => item.trim()).filter(Boolean))];
}

function isUnclassified(entry: CompanyMasterEntry) {
  return entry.themeId === "other" || entry.theme === "その他";
}

export default function AdminCompanyMasterManager({ initialEntries }: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [draft, setDraft] = useState<CompanyMasterEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selected = selectedTicker
    ? entries.find((entry) => entry.ticker === selectedTicker) ?? null
    : null;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return entries.filter((entry) => {
      if (filter === "reviewed" && !entry.reviewed) return false;
      if (filter === "automatic" && entry.reviewed) return false;
      if (filter === "unclassified" && !isUnclassified(entry)) return false;

      if (!normalized) return true;
      return [
        entry.ticker,
        entry.companyName,
        entry.theme,
        entry.subTheme,
        entry.businessModel,
        entry.keywords.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [entries, filter, query]);

  const summary = {
    total: entries.length,
    reviewed: entries.filter((entry) => entry.reviewed).length,
    automatic: entries.filter((entry) => !entry.reviewed).length,
    unclassified: entries.filter(isUnclassified).length,
  };

  function openEditor(entry: CompanyMasterEntry) {
    setSelectedTicker(entry.ticker);
    setDraft({ ...entry, rivalTickers: [...entry.rivalTickers], keywords: [...entry.keywords] });
    setMessage("");
  }

  function closeEditor() {
    setSelectedTicker(null);
    setDraft(null);
    setMessage("");
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/company-master", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: draft.ticker,
          companyName: draft.companyName,
          theme: draft.theme,
          subTheme: draft.subTheme,
          businessModel: draft.businessModel,
          marketCapClass: draft.marketCapClass,
          rivalTickers: draft.rivalTickers,
          keywords: draft.keywords,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "保存に失敗しました。");
      }

      const updated: CompanyMasterEntry = {
        ...draft,
        reviewed: true,
        source: "curated",
        updatedAt: payload.row?.updated_at ?? new Date().toISOString(),
      };

      setEntries((current) =>
        current.map((entry) => (entry.ticker === updated.ticker ? updated : entry))
      );
      setDraft(updated);
      setMessage("保存しました。比較候補にも反映されます。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["全社", summary.total],
          ["監修済み", summary.reviewed],
          ["自動分類", summary.automatic],
          ["未分類", summary.unclassified],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">{label}</p>
            <p className="mt-2 text-3xl font-black">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="証券コード・会社名・テーマ・キーワードで検索"
            className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none placeholder:text-slate-500 focus:border-green-400/50"
          />
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "すべて"],
              ["reviewed", "監修済み"],
              ["automatic", "自動分類"],
              ["unclassified", "未分類"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value as Filter)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  filter === value
                    ? "bg-green-400 text-slate-950"
                    : "border border-white/10 bg-black/20 text-slate-300 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-400">表示中：{filtered.length}社</p>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-white/10 text-slate-300">
              <tr>
                <th className="p-4">会社</th>
                <th className="p-4">分類</th>
                <th className="p-4">ビジネスモデル</th>
                <th className="p-4">ライバル</th>
                <th className="p-4">状態</th>
                <th className="p-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.ticker} className="border-t border-white/10 align-top">
                  <td className="p-4">
                    <p className="font-black text-white">{entry.companyName}</p>
                    <p className="mt-1 text-xs text-slate-500">{entry.ticker}</p>
                  </td>
                  <td className="p-4">
                    <p className="font-bold text-green-300">{entry.theme}</p>
                    <p className="mt-1 text-slate-400">{entry.subTheme}</p>
                  </td>
                  <td className="max-w-xs p-4 leading-6 text-slate-300">{entry.businessModel}</td>
                  <td className="p-4 text-slate-300">{entry.rivalTickers.join("、") || "未設定"}</td>
                  <td className="p-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${
                        entry.reviewed
                          ? "bg-green-500/15 text-green-200"
                          : isUnclassified(entry)
                            ? "bg-red-500/15 text-red-200"
                            : "bg-yellow-500/15 text-yellow-200"
                      }`}
                    >
                      {entry.reviewed ? "監修済み" : isUnclassified(entry) ? "未分類" : "自動分類"}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      type="button"
                      onClick={() => openEditor(entry)}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-bold text-white hover:bg-white/10"
                    >
                      編集
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && draft ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-6">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0a1020] p-5 shadow-2xl sm:rounded-3xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-[0.25em] text-green-300">COMPANY MASTER</p>
                <h2 className="mt-2 text-2xl font-black">{draft.companyName}</h2>
                <p className="mt-1 text-sm text-slate-500">{draft.ticker}</p>
              </div>
              <button type="button" onClick={closeEditor} className="rounded-full border border-white/10 px-3 py-2 text-slate-300">閉じる</button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                ["会社名", "companyName"],
                ["テーマ", "theme"],
                ["サブテーマ", "subTheme"],
                ["ビジネスモデル", "businessModel"],
                ["時価総額区分", "marketCapClass"],
              ].map(([label, key]) => (
                <label key={key} className={key === "businessModel" ? "sm:col-span-2" : ""}>
                  <span className="text-sm font-bold text-slate-300">{label}</span>
                  <input
                    value={(draft[key as keyof CompanyMasterEntry] as string | null) ?? ""}
                    onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                    className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none focus:border-green-400/50"
                  />
                </label>
              ))}

              <label className="sm:col-span-2">
                <span className="text-sm font-bold text-slate-300">ライバル証券コード</span>
                <input
                  value={draft.rivalTickers.join(", ")}
                  onChange={(event) => setDraft({ ...draft, rivalTickers: splitList(event.target.value) })}
                  placeholder="9348, 5595, 290A"
                  className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none focus:border-green-400/50"
                />
              </label>

              <label className="sm:col-span-2">
                <span className="text-sm font-bold text-slate-300">キーワード</span>
                <input
                  value={draft.keywords.join(", ")}
                  onChange={(event) => setDraft({ ...draft, keywords: splitList(event.target.value) })}
                  placeholder="宇宙, 衛星, デブリ"
                  className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none focus:border-green-400/50"
                />
              </label>
            </div>

            {message ? (
              <p className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${message.includes("保存しました") ? "border-green-400/20 bg-green-500/10 text-green-200" : "border-red-400/20 bg-red-500/10 text-red-200"}`}>
                {message}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeEditor} className="min-h-12 rounded-full border border-white/10 px-6 font-bold text-slate-300">キャンセル</button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="min-h-12 rounded-full bg-green-400 px-7 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "保存中…" : "監修済みとして保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
