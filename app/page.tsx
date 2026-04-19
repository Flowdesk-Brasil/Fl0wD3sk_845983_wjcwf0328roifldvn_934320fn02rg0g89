import Script from "next/script";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { MaintenanceGate } from "@/components/common/MaintenanceGate";
import { LandingRuntimeShell } from "@/components/landing/LandingRuntimeShell";

export default async function HomePage() {
  return (
    <MaintenanceGate area="landing">
      <HomePageContent />
    </MaintenanceGate>
  );
}

async function HomePageContent() {
  return (
    <>
      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4997317332626224"
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
      <LandingRuntimeShell />
    </>
  );
}
