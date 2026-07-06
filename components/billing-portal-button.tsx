import { createBillingPortalSession } from "@/app/profile/billing-actions";

export default function BillingPortalButton() {
  return (
    <form action={createBillingPortalSession}>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-slate-100 transition hover:bg-white/10 active:scale-95"
      >
        課金管理・解約へ
      </button>
    </form>
  );
}
