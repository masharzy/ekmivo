"use client";

import {useActionState} from "react";
import {useRouter} from "next/navigation";

/** Super Admin setting for the one-time free AI credit (0260). Same pattern as the shop assistant model. */
export function AdminAiFreeCredit({locale, revision, amountMinor, changedBy, changedAt, customerFlagOn, canEdit}: {
  locale: "en" | "bn";
  revision: string;
  amountMinor: number;
  changedBy: string | null;
  changedAt: string | null;
  customerFlagOn: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [status, action, pending] = useActionState(async (_previous: number, form: FormData) => {
    const body = new URLSearchParams();
    for (const [key, value] of form) if (typeof value === "string") body.set(key, value);
    try {
      const response = await fetch("/api/admin/ai-free-credit", {method: "POST", body});
      if (response.ok) router.refresh();
      return response.status;
    } catch {
      return 503;
    }
  }, 0);
  const t = (en: string, bn: string) => locale === "bn" ? bn : en;
  const taka = amountMinor / 100;

  return <section className="pa-surface pa-admin-credit-form" aria-labelledby="ai-free-credit-title">
    <h2 id="ai-free-credit-title">{t("Free AI credit", "ফ্রি এআই ক্রেডিট")}</h2>
    <p className="pa-subtle">
      {amountMinor > 0
        ? t(`৳${taka} once per business and once per person.`, `প্রতি ব্যবসায় আর প্রতি ব্যক্তিকে একবার ৳${taka}।`)
        : t("Off: no free credit is given.", "বন্ধ: কোনো ফ্রি ক্রেডিট দেওয়া হয় না।")}
      {" "}{customerFlagOn ? "" : t("Customers cannot claim it yet (BRIOFOLD_AI_FREE_CREDIT_ENABLED is off).", "গ্রাহকেরা এখনো নিতে পারবেন না (BRIOFOLD_AI_FREE_CREDIT_ENABLED বন্ধ)।")}
    </p>
    {changedBy && changedAt && <p className="pa-subtle">
      {t("Last changed by", "শেষ বদলেছেন")} {changedBy} · {new Date(changedAt).toLocaleString(locale === "bn" ? "bn-BD" : "en-GB", {dateStyle: "medium", timeStyle: "short"})}
    </p>}
    {canEdit && <form action={action} className="pa-admin-fields" onSubmit={event => {
      const value = new FormData(event.currentTarget).get("amount_taka");
      const message = String(value) === "0"
        ? t("Turn free AI credit off?", "ফ্রি এআই ক্রেডিট বন্ধ করবেন?")
        : t(`Give ৳${value} free AI credit from now on? Credit already given does not change.`, `এখন থেকে ৳${value} ফ্রি এআই ক্রেডিট দেবেন? আগে দেওয়া ক্রেডিট বদলাবে না।`);
      if (!window.confirm(message)) event.preventDefault();
    }}>
      <input type="hidden" name="revision" value={revision}/>
      <label>{t("Amount (BDT, 0 to 500; 0 turns it off)", "অঙ্ক (টাকা, ০ থেকে ৫০০; ০ মানে বন্ধ)")}
        <input type="number" name="amount_taka" min={0} max={500} step={1} required defaultValue={taka} key={revision} inputMode="numeric"/>
      </label>
      <button className="pa-button pa-button-primary" disabled={pending}>{t("Save", "সংরক্ষণ করুন")}</button>
      {status !== 0 && <p role="status" className={status === 204 ? "pa-action-success" : "pa-action-error"}>
        {status === 204 ? t("Free credit saved.", "ফ্রি ক্রেডিট সংরক্ষিত হয়েছে।")
          : status === 409 ? t("Someone else changed it. Refresh and try again.", "অন্য কেউ বদলেছেন। রিফ্রেশ করে আবার চেষ্টা করুন।")
          : t("Could not save. Use a whole amount from 0 to 500.", "সংরক্ষণ হয়নি। ০ থেকে ৫০০-এর মধ্যে পুরো টাকা দিন।")}
      </p>}
    </form>}
  </section>;
}
