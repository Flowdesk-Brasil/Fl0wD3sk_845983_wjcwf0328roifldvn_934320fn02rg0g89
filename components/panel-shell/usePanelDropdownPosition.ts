"use client";

import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

export type PanelDropdownPosition = {
  top: number;
  right: number;
  width: number;
};

export function usePanelDropdownPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  widthPx = 360,
) {
  const [position, setPosition] = useState<PanelDropdownPosition | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const width = Math.min(widthPx, Math.max(240, window.innerWidth - 24));
    const right = Math.max(12, window.innerWidth - rect.right);

    setPosition({
      top: rect.bottom + 8,
      right,
      width,
    });
  }, [anchorRef, widthPx]);

  useLayoutEffect(() => {
    if (!open) return;

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return position;
}
