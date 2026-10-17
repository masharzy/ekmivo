#!/usr/bin/env python3
"""Guard approved Ekmivo Admin design values against accidental changes."""
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parents[3]  # repository root
html = (root / "docs/design/ekmivo-admin-reference.html").read_text(encoding="utf-8")
css = (root / "apps/web/src/styles/admin/admin-tokens.css").read_text(encoding="utf-8")
adapter = (root / "apps/web/src/styles/admin/admin-components.css").read_text(encoding="utf-8")
theme = (root / "apps/web/src/styles/admin/admin-theme.css").read_text(encoding="utf-8")
shell = (root / "apps/web/src/components/platform-admin-shell.tsx").read_text(encoding="utf-8")
globals_css = (root / "apps/web/src/app/globals.css").read_text(encoding="utf-8")
ref = html.split("<style>", 1)[1].split("</style>", 1)[0]
light = re.search(r":root\{([^}]*)\}", ref).group(1)
dark = re.search(r"--bg:#0a0a0a;.*?color-scheme:dark", ref).group(0)
source_vars = lambda s: dict(re.findall(r"(--[\w-]+):([^;{}]+)", s))
names = ["--bg","--sf","--s2","--s3","--bd","--tx","--t2","--mu","--ac","--ok","--wa","--ba","--ink","--onink","--sh"]
errors=[]
for block, theme_name in [(light, "light"), (dark, "dark")]:
    actual = source_vars(block)
    scope_marker = 'data-admin-theme="dark"' if theme_name=="dark" else 'pa-root.pa-admin-design'
    for token in names:
        if token not in actual or f"{token}:{actual.get(token)}" not in css:
            errors.append(f"{theme_name} {token}: expected approved HTML value {actual.get(token)!r}")
if 'font:13px/1.45 Inter' not in theme: errors.append("Admin typography drift")
for needle in ["grid-template-columns:212px", "grid-template-rows:48px", "max-width:1180px", "height:28px", "width:min(480px"]:
    if needle not in adapter: errors.append("Admin component drift: "+needle)
if "data-admin-theme={mode}" not in shell or 'ekmivo-admin-theme=' not in shell:
    errors.append("Admin root/cookie isolation missing")
if 'document.documentElement.dataset.theme=mode' in shell:
    errors.append("Admin theme still changes public document theme")
for filename in ["admin-tokens.css","admin-theme.css","admin-components.css"]:
    if f'admin/{filename}' not in globals_css:
        errors.append("Production import missing: "+filename)
expected_nav=["","workspaces","subscriptions","billing","plans","providers","credits","support","health","audit","settings"]
match=re.search(r"const groups=\\[(.*?)\\] as const;",shell,re.S)
actual_nav=re.findall(r'\\["[^"]+","([^"]*)","[^"]+"\\]',match.group(1)) if match else []
if actual_nav!=expected_nav:
    errors.append(f"Admin sidebar drift: expected 11 approved paths {expected_nav!r}, got {actual_nav!r}")
if errors:
    print("FAIL: approved Admin design drift:")
    for err in errors: print(" - "+err)
    sys.exit(1)
print("PASS: Admin reference tokens, 11-menu sidebar, font, sizes, isolated theme and imports")
