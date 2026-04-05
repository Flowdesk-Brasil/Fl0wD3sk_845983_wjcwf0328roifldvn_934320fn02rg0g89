"use client";

import { useEffect } from "react";

type BodyStyleSnapshot = {
  overflow: string;
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  paddingRight: string;
  touchAction: string;
  overscrollBehavior: string;
};

type HtmlStyleSnapshot = {
  overflow: string;
  overscrollBehavior: string;
};

type BodyScrollLockState = {
  count: number;
  scrollY: number;
  bodyStyles: BodyStyleSnapshot | null;
  htmlStyles: HtmlStyleSnapshot | null;
};

declare global {
  interface Window {
    __flowdeskBodyScrollLockState__?: BodyScrollLockState;
  }
}

function getBodyScrollLockState() {
  if (!window.__flowdeskBodyScrollLockState__) {
    window.__flowdeskBodyScrollLockState__ = {
      count: 0,
      scrollY: 0,
      bodyStyles: null,
      htmlStyles: null,
    };
  }

  return window.__flowdeskBodyScrollLockState__;
}

function lockBodyScroll() {
  const state = getBodyScrollLockState();

  if (state.count === 0) {
    const { body, documentElement } = document;
    const scrollbarWidth = Math.max(
      0,
      window.innerWidth - documentElement.clientWidth,
    );

    state.scrollY = window.scrollY;
    state.bodyStyles = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
      touchAction: body.style.touchAction,
      overscrollBehavior: body.style.overscrollBehavior,
    };
    state.htmlStyles = {
      overflow: documentElement.style.overflow,
      overscrollBehavior: documentElement.style.overscrollBehavior,
    };

    documentElement.style.overflow = "hidden";
    documentElement.style.overscrollBehavior = "none";

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${state.scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.touchAction = "none";
    body.style.overscrollBehavior = "none";

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  state.count += 1;
}

function unlockBodyScroll() {
  const state = getBodyScrollLockState();
  state.count = Math.max(0, state.count - 1);

  if (state.count !== 0) {
    return;
  }

  const { body, documentElement } = document;
  const savedScrollY = state.scrollY;

  if (state.bodyStyles) {
    body.style.overflow = state.bodyStyles.overflow;
    body.style.position = state.bodyStyles.position;
    body.style.top = state.bodyStyles.top;
    body.style.left = state.bodyStyles.left;
    body.style.right = state.bodyStyles.right;
    body.style.width = state.bodyStyles.width;
    body.style.paddingRight = state.bodyStyles.paddingRight;
    body.style.touchAction = state.bodyStyles.touchAction;
    body.style.overscrollBehavior = state.bodyStyles.overscrollBehavior;
  }

  if (state.htmlStyles) {
    documentElement.style.overflow = state.htmlStyles.overflow;
    documentElement.style.overscrollBehavior =
      state.htmlStyles.overscrollBehavior;
  }

  window.scrollTo(0, savedScrollY);
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === "undefined") {
      return;
    }

    lockBodyScroll();

    return () => {
      unlockBodyScroll();
    };
  }, [active]);
}
