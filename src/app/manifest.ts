import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Corpo & Evolução",
    short_name: "Corpo & Evolução",
    description: "Portal e gestão do Studio Corpo & Evolução.",
    start_url: "/portal",
    display: "standalone",
    background_color: "#f7f9fc",
    theme_color: "#1a73e8",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
