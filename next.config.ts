import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
  outputFileTracingRoot: appRoot,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  compress: true,
  images: {
    loader: "custom",
    loaderFile: "./lib/images/flowSecureLoader.ts",
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24,
    contentDispositionType: "inline",
    dangerouslyAllowSVG: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
      {
        protocol: "https",
        hostname: "media.discordapp.net",
      },
      {
        protocol: "https",
        hostname: "images-ext-1.discordapp.net",
      },
      {
        protocol: "https",
        hostname: "images-ext-2.discordapp.net",
      },
      {
        protocol: "https",
        hostname: "cdn.flwdesk.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  turbopack: {
    root: appRoot,
  },
  async redirects() {
    return [
      {
        source: "/tos/",
        destination: "/terms/",
        permanent: true,
      },
      {
        source: "/rules/",
        destination: "/privacy/",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/cdn/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
          {
            key: "Referrer-Policy",
            value: "same-origin",
          },
          {
            key: "X-Permitted-Cross-Domain-Policies",
            value: "none",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
