import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Corpo & Evolucao",
    short_name: "Corpo & Evolucao",
    description: "Portal e gestao do Studio Corpo & Evolucao.",
    start_url: "/portal",
    display: "standalone",
    background_color: "#0C0C0C",
    theme_color: "#0C0C0C",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
