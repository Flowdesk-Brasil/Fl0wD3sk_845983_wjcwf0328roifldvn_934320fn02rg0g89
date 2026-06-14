import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Corpo & Evolucao",
    short_name: "Corpo & Evolucao",
    description: "Portal e gestao do Studio Corpo & Evolucao.",
    start_url: "/portal",
    scope: "/",
    id: "/portal",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    background_color: "#0C0C0C",
    theme_color: "#0C0C0C",
    orientation: "portrait",
    categories: ["business", "fitness"],
    launch_handler: {
      client_mode: "focus-existing",
    },
    shortcuts: [
      {
        name: "Ver QR Code",
        short_name: "QR Code",
        description: "Visualize seu QR code para check-in",
        url: "/portal?tab=qr",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
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
