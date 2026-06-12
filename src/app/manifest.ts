import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Corpo & Evolução",
    short_name: "Corpo & Evolução",
    description: "Portal e gestão do Studio Corpo & Evolução.",
    start_url: "/portal",
    display: "standalone",
    background_color: "#0C0C0C",
    theme_color: "#0C0C0C",
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
