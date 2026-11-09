"use client";

import {useActionState} from "react";
import {useRouter} from "next/navigation";

export function AdminShopAssistantModel({locale, revision, model, options}: {
  locale: "en" | "bn";
  revision: string;
  model: string | null;
  options: string[];
}) {
  const router = useRouter();
  const [status, action, pending] = useActionState(async (_previous: number, form: FormData) => {
    const body = new URLSearchParams();
    for (const [key, value] of form) if (typeof value === "string") body.set(key, value);
    try {
      const response = await fetch("/api/admin/shop-assistant-model", {method: "POST", body});
      if (response.ok) router.refresh();
      return response.status;
    } catch {
      return 503;
    }
  }, 0);
  const t = (en: string, bn: string) => locale === "bn" ? bn : en;

  return <section className="pa-surface pa-admin-credit-form" aria-labelledby="shop-assistant-model-title">
    <h2 id="shop-assistant-model-title">{t("Shop assistant model", "দোকান সহকারীর মডেল")}</h2>
    <p className="pa-subtle">{t("Active model", "সক্রিয় মডেল")} · {model ?? t("Default", "ডিফল্ট")}</p>
    <form action={action} className="pa-admin-fields" onSubmit={event => {
      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      const message = submitter?.value === "rollback"
        ? t("Restore the previous model?", "আগের মডেলটি ফিরিয়ে আনবেন?")
        : t("Change the shop assistant model?", "দোকান সহকারীর মডেল বদলাবেন?");
      if (!window.confirm(message)) event.preventDefault();
    }}>
      <input type="hidden" name="revision" value={revision}/>
      <label>{t("Model", "মডেল")}
        <select name="model" defaultValue="" key={revision}>
          <option value="" disabled>{t("Select a model", "মডেল নির্বাচন করুন")}</option>
          {options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <button className="pa-button pa-button-primary" name="operation" value="save" disabled={pending || options.length === 0}>
        {t("Save model", "মডেল সংরক্ষণ করুন")}
      </button>
      <button className="pa-button" name="operation" value="rollback" disabled={pending || !model}>
        {t("Rollback", "আগের মডেলে ফিরুন")}
      </button>
      {status !== 0 && <p role="status" className={status === 204 ? "pa-action-success" : "pa-action-error"}>
        {status === 204 ? t("Model setting saved.", "মডেল সেটিং সংরক্ষিত হয়েছে।")
          : t("Could not update the model. Refresh and try again.", "মডেল বদলানো যায়নি। পৃষ্ঠা রিফ্রেশ করে আবার চেষ্টা করুন।")}
      </p>}
    </form>
  </section>;
}
