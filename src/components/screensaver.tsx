"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ScreensaverProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  idleTimeout?: number;
  isReady?: boolean;
  isOverlayActive?: boolean;
};

const SAMPLE_WIDTH = 144;
const SAMPLE_HEIGHT = 96;
const MOTION_DELTA = 42;
const MOTION_PIXELS = 95;

export function Screensaver({
  videoRef,
  idleTimeout = 10,
  isReady = true,
  isOverlayActive = false,
}: ScreensaverProps) {
  const [active, setActive] = useState(false);
  const [visible, setVisible] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousFrameRef = useRef<Uint8ClampedArray | null>(null);
  const lastMotionAtRef = useRef(Date.now());
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const wake = useCallback(() => {
    lastMotionAtRef.current = Date.now();
    previousFrameRef.current = null;
    if (!activeRef.current) return;

    setVisible(false);
    window.setTimeout(() => setActive(false), 260);
  }, []);

  const detectMotion = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return false;

    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;

    canvas.width = SAMPLE_WIDTH;
    canvas.height = SAMPLE_HEIGHT;
    context.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);

    const current = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data;
    const previous = previousFrameRef.current;
    previousFrameRef.current = new Uint8ClampedArray(current);
    if (!previous) return false;

    let changed = 0;
    for (let index = 0; index < current.length; index += 16) {
      const diff =
        Math.abs(current[index] - previous[index]) +
        Math.abs(current[index + 1] - previous[index + 1]) +
        Math.abs(current[index + 2] - previous[index + 2]);
      if (diff > MOTION_DELTA) changed++;
      if (changed > MOTION_PIXELS) return true;
    }

    return false;
  }, [videoRef]);

  useEffect(() => {
    if (!isReady || isOverlayActive) {
      wake();
      return;
    }

    lastMotionAtRef.current = Date.now();
    previousFrameRef.current = null;

    const interval = window.setInterval(() => {
      if (detectMotion()) {
        wake();
        return;
      }

      const idleFor = Date.now() - lastMotionAtRef.current;
      if (!activeRef.current && idleFor >= idleTimeout * 1000) {
        setActive(true);
        window.requestAnimationFrame(() => setVisible(true));
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [detectMotion, idleTimeout, isOverlayActive, isReady, wake]);

  useEffect(() => {
    const events = ["mousemove", "mousedown", "touchstart", "keydown", "pointerdown"] as const;
    events.forEach((event) => window.addEventListener(event, wake, { passive: true }));
    return () => events.forEach((event) => window.removeEventListener(event, wake));
  }, [wake]);

  if (!active) return null;

  return (
    <div className={`kiosk-screensaver ${visible ? "is-visible" : ""}`} aria-hidden="true">
      <div className="kiosk-screensaver__glow kiosk-screensaver__glow--main" />
      <div className="kiosk-screensaver__glow kiosk-screensaver__glow--edge" />
      <div className="kiosk-screensaver__grid" />

      <div className="kiosk-screensaver__brand">
        <img className="kiosk-screensaver__logo" src="/imagotipo.svg" alt="" draggable={false} />
        <span className="kiosk-screensaver__pulse" />
      </div>
    </div>
  );
}
