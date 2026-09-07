"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, ComponentProps, ReactNode } from "react";
import { buildBrowserRoutingTargetFromInternalPath } from "@/lib/routing/subdomains";

type MarketingLinkProps = Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & {
  href: string;
  children: ReactNode;
  prefetch?: boolean;
  openExternalInNewTab?: boolean;
};

function isAbsoluteHref(href: string) {
  return href.startsWith("http://") || href.startsWith("https://");
}

export function MarketingLink({
  href,
  prefetch = false,
  openExternalInNewTab = false,
  children,
  ...props
}: MarketingLinkProps) {
  if (isAbsoluteHref(href)) {
    return (
      <a
        href={href}
        target={openExternalInNewTab ? "_blank" : undefined}
        rel={openExternalInNewTab ? "noreferrer noopener" : undefined}
        {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </a>
    );
  }

  const target = buildBrowserRoutingTargetFromInternalPath(href);

  if (!target.sameOrigin) {
    return (
      <a
        href={target.href}
        {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={target.path} prefetch={prefetch} {...props}>
      {children}
    </Link>
  );
}
