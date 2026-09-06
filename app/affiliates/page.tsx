import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { AffiliatesLanding } from "@/components/affiliates/AffiliatesLanding";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingFrameLines } from "@/components/landing/LandingFrameLines";
import type { Metadata } from "next";
import { buildFlowCwvMetadata } from "@/lib/seo/flowCwv";
import { TopBetaBanner } from "@/components/landing/TopBetaBanner";
import { resolveAuthUserAvatarUrl } from "@/lib/auth/avatar";
import { getProgramRulesSummary } from "@/lib/affiliates/programRules";

export const metadata: Metadata = buildFlowCwvMetadata({
  title: "Programa de Afiliados - Flowdesk",
  description:
    "Indique o Flowdesk e ganhe ate 35% de comissao por cada venda aprovada. Dashboard exclusivo, ranking com bonus, webhook em tempo real e muito mais.",
  pathname: "/affiliates",
  keywords: [
    "programa de afiliados",
    "afiliados flowdesk",
    "comissao",
    "dashboard de afiliado",
  ],
});

export default async function AffiliatesPage() {
  const user = await getCurrentUserFromSessionCookie();

  const authenticatedUser = user
    ? {
        username: user.username,
        avatarUrl: resolveAuthUserAvatarUrl(user),
        href: "/affiliates/dashboard",
      }
    : null;

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#040404] text-white">
      <div className="flowdesk-page-scale-80">
        <TopBetaBanner />
        <LandingFrameLines />
        <LandingHeader authenticatedUser={authenticatedUser} />
        <main className="w-full pb-20">
          <AffiliatesLanding isAuthenticated={Boolean(user)} rules={getProgramRulesSummary()} />
        </main>
        <LandingFooter />
      </div>
    </div>
  );
}
