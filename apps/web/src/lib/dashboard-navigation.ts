import { sections, type SectionKey } from "./dashboard-sections";

export type Service = "ai" | "payments";
export type Locale = "bn" | "en";
export const serviceNames = { ai: { en: "AI workspace", bn: "AI ওয়ার্কস্পেস" }, payments: { en: "Payment gateway", bn: "পেমেন্ট গেটওয়ে" } } as const;
export type NavigationGroup = { label: { en: string; bn: string }; items: SectionKey[] };
export const navigation: Record<Service, NavigationGroup[]> = {
  ai: [
    { label: { en: "Overview", bn: "সারসংক্ষেপ" }, items: ["overview", "notifications", "reports"] },
    { label: { en: "Customer conversations", bn: "গ্রাহকের সঙ্গে যোগাযোগ" }, items: ["inbox", "comments", "saved-replies", "contacts", "tickets"] },
    { label: { en: "Sales & growth", bn: "বিক্রয় ও ফলো-আপ" }, items: ["leads", "follow-ups", "broadcasts", "bookings"] },
    { label: { en: "Your AI", bn: "আপনার AI" }, items: ["ai-agent", "knowledge", "products", "posts"] },
    { label: { en: "Connections", bn: "সংযোগ" }, items: ["channels", "website"] },
    { label: { en: "Workspace", bn: "ওয়ার্কস্পেস" }, items: ["team", "billing", "settings", "help"] },
  ],
  payments: [
    { label: { en: "Workspace", bn: "ওয়ার্কস্পেস" }, items: ["overview", "transactions", "customers", "invoices", "payment-links", "reports", "refunds"] },
    { label: { en: "Devices & methods", bn: "ডিভাইস ও মাধ্যম" }, items: ["gateways", "devices", "incoming"] },
    { label: { en: "Store settings", bn: "স্টোর সেটিংস" }, items: ["checkout-themes", "store"] },
    { label: { en: "Developers", bn: "ডেভেলপার" }, items: ["developers", "api-docs"] },
    { label: { en: "Account", bn: "অ্যাকাউন্ট" }, items: ["team"] },
  ],
};
export function serviceEnabled(service: Service, mode: "ai" | "commerce" | "both" | "off") {
  return mode === "both" || (service === "ai" ? mode === "ai" : mode === "commerce");
}
export function sectionInService(service: Service, section: string): section is SectionKey {
  if(service==="payments"&&["events","notifications","integrations","requests","webhooks","apps","reconciliation","team","billing","settings","help","orders","products","inventory","coupons","shipping","returns"].includes(section))return true;
  return navigation[service].some(group => group.items.includes(section as SectionKey));
}
export function defaultService(mode: "ai" | "commerce" | "both" | "off"): Service { return mode === "ai" ? "ai" : "payments"; }
export function sectionService(section: SectionKey, mode: "ai" | "commerce" | "both" | "off"): Service {
  if (sectionInService("ai", section) && sectionInService("payments", section)) return defaultService(mode);
  return sectionInService("payments", section) ? "payments" : "ai";
}
export type PaymentEnvironment = "sandbox" | "live";
export function canonicalEnvironment(raw: string | undefined | null): PaymentEnvironment | null {
  if(raw == null || raw === "") return "live";
  return raw === "sandbox" || raw === "live" ? raw : null;
}
export function dashboardHref(locale: Locale, workspaceId: string, service: Service, section: SectionKey = "overview", environment: PaymentEnvironment = "live") {
  const base = `/w/${workspaceId}/${service}/${section}`;
  // Sandbox/Live URL selector deliberately paused. The authorized payment
  // context resolves to Live server-side; keep the type for future reactivation.
  // return service === "payments" ? `${base}?env=${environment}` : base;
  void locale; void environment;
  return base;
}
export function searchableNavigation(service: Service, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return navigation[service].map(group => ({ ...group, items: group.items.filter(key => `${sections[key].en} ${sections[key].bn}`.toLocaleLowerCase().includes(normalized)) })).filter(group => group.items.length);
}

/** Search only memberships supplied by the authenticated server, never the global tenant table.
 * Business results are switch shortcuts, NOT payment/customer record search. */
export function searchableBusinesses<T extends {name: string}>(authorized: readonly T[], query: string): T[] {
 const term=query.trim().toLocaleLowerCase();
 if(!term)return [];
 return authorized.filter(space=>space.name.toLocaleLowerCase().includes(term)).slice(0,8);
}
