import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import FormSubmitButton from "@/components/form-submit-button";
import { updateProfile } from "./actions";

type PageProps = {
  searchParams?: Promise<{
    saved?: string;
    error?: string;
  }>;
};

export default async function ProfilePage({ searchParams }: PageProps) {
  const { userId } = await auth();
  const user = await currentUser();
  const params = await searchParams;

  if (!userId) {
    redirect("/");
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("display_name, plan")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  const defaultName =
    profile?.display_name ||
    user?.firstName ||
    user?.username ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "ログインユーザー";

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="text-2xl font-black">
            決算探偵
          </Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-white">
            ← ランキングへ
          </Link>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
          <p className="text-xs tracking-[0.25em] text-slate-500">PROFILE</p>
          <h1 className="mt-3 text-4xl font-black">プロフィール</h1>

          {params?.saved === "1" ? (
            <div className="mt-5 rounded-2xl border border-green-400/20 bg-green-500/10 p-4 text-green-300">
              ✅ プロフィールを保存しました。
            </div>
          ) : null}

          {params?.error === "1" ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-red-300">
              ❌ 保存に失敗しました。表示名を確認してください。
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
            <p className="text-sm text-slate-400">現在のプラン</p>
            <p className="mt-2 text-2xl font-black text-green-300">
              {profile?.plan === "pro" ? "Pro" : "Free"}
            </p>
          </div>

          <form action={updateProfile} className="mt-6 grid gap-4">
            <div>
              <label className="text-sm font-bold text-slate-300">表示名</label>
              <input
                name="display_name"
                defaultValue={defaultName}
                maxLength={30}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-green-400/60"
              />
              <p className="mt-2 text-xs text-slate-500">
                掲示板投稿時の名前として使われます。投稿画面で毎回入力する必要はありません。
              </p>
            </div>

            <FormSubmitButton
              pendingText="保存中..."
              className="rounded-2xl bg-green-400 px-5 py-3 font-black text-slate-950 hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              保存する
            </FormSubmitButton>
          </form>
        </div>
      </div>
    </main>
  );
}