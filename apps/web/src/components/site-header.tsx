"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SiteControls } from "./site-controls";
import { siteCopy, type Locale } from "../lib/site-copy";

type Theme = "system" | "light" | "dark";

export function SiteHeader({ locale, initialTheme }: { locale: Locale; initialTheme: Theme }) {
  const t = siteCopy[locale];
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastY = useRef(0);
  // Smooth anchor navigation must not look like a user's scroll-down.
  const keepVisibleAfterAnchor = useRef(false);

  function onSectionNavigate() {
    keepVisibleAfterAnchor.current = true;
    setHidden(false);
    setMenuOpen(false);
  }

  useEffect(() => {
    const releasePinnedHeader = () => { keepVisibleAfterAnchor.current = false; };
    const onKeyboardScroll = (event: KeyboardEvent) => {
      if (!["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      releasePinnedHeader();
    };
    const onAnchorHistory = () => {
      if (window.location.hash) {
        keepVisibleAfterAnchor.current = true;
        setHidden(false);
      }
    };
    onAnchorHistory(); // Keep navigation visible on deep links and reloads.
    window.addEventListener("hashchange", onAnchorHistory);
    window.addEventListener("popstate", onAnchorHistory);
    window.addEventListener("wheel", releasePinnedHeader, { passive: true });
    window.addEventListener("touchmove", releasePinnedHeader, { passive: true });
    document.addEventListener("pointerdown", releasePinnedHeader, { passive: true });
    window.addEventListener("keydown", onKeyboardScroll);
    return () => {
      window.removeEventListener("hashchange", onAnchorHistory);
      window.removeEventListener("popstate", onAnchorHistory);
      window.removeEventListener("wheel", releasePinnedHeader);
      window.removeEventListener("touchmove", releasePinnedHeader);
      document.removeEventListener("pointerdown", releasePinnedHeader);
      window.removeEventListener("keydown", onKeyboardScroll);
    };
  }, []);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      setScrolled(y > 36);
      if (keepVisibleAfterAnchor.current || y < 72 || menuOpen) setHidden(false);
      else if (delta > 6 && y > 168) setHidden(true);
      else if (delta < -6) setHidden(false);
      lastY.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [menuOpen]);

  return <header inert={hidden} className={`site-header${scrolled ? " is-wide" : ""}${hidden ? " is-hidden" : ""}${menuOpen ? " menu-open" : ""}`}>
    <div className="header-inner">
      <Link className="brand" href={`/${locale}`} aria-label="Ekmivo home" onClick={() => setMenuOpen(false)}><span className="brand-mark" aria-hidden="true"><span /></span><span>ekmivo<span className="brand-dot">.</span></span></Link>
      <nav className={`header-nav${menuOpen ? " open" : ""}`} aria-label={locale === "bn" ? "প্রধান নেভিগেশন" : "Main navigation"}>
        <Link href={`/${locale}#services`} onClick={onSectionNavigate}>{t.nav.services}</Link>
        <Link href={`/${locale}#ai`} onClick={onSectionNavigate}>{t.nav.ai}</Link>
        <Link href={`/${locale}#commerce`} onClick={onSectionNavigate}>{t.nav.commerce}</Link>
        <Link href={`/${locale}#workflow`} onClick={onSectionNavigate}>{t.nav.workflow}</Link>
        <Link href={`/${locale}#pricing`} onClick={onSectionNavigate}>{t.nav.pricing}</Link>
        <Link className="mobile-extra" href={`/${locale}#solutions`} onClick={onSectionNavigate}>{t.nav.solutions}</Link>
        <Link className="mobile-extra" href={`/${locale}#faq`} onClick={onSectionNavigate}>{t.nav.faq}</Link>
        <Link className="mobile-login" href={`/${locale}/login`} onClick={() => setMenuOpen(false)}>{t.login}</Link>
        <Link className="mobile-register" href={`/${locale}/register`} onClick={() => setMenuOpen(false)}>{t.register} ↗</Link>
      </nav>
      <div className="header-right">
        <SiteControls locale={locale} initialTheme={initialTheme} />
        <Link className="header-login" href={`/${locale}/login`}>{t.login}</Link>
        <Link className="header-cta" href={`/${locale}/register`}>{t.register}<span aria-hidden="true">↗</span></Link>
        <button className="menu-toggle" type="button" aria-label={menuOpen ? t.closeMenu : t.menu} aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}><span /><span /></button>
      </div>
    </div>
  </header>;
}
