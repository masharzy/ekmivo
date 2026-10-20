import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  // Normalize old language-prefixed bookmarks before proxy.ts handles the
  // language-neutral public URL. Internal Next rewrites still use [locale].
  async redirects() {
    return [
      { source: "/bn", destination: "/", permanent: false },
      { source: "/en", destination: "/", permanent: false },
      { source: "/:locale(bn|en)/:path*", destination: "/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
