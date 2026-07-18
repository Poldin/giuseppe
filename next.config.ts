import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["search-engine", "pdfkit"],
  async rewrites() {
    return [
      // generateSitemaps non espone l'indice su /sitemap.xml → route dedicata
      { source: "/sitemap.xml", destination: "/sitemap-index.xml" },
    ];
  },
};

export default nextConfig;
