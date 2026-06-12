"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface ScreensaverProps {
  /** Reference to the video element to detect motion from */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Seconds of inactivity before screensaver activates */
  idleTimeout?: number;
  /** Whether the system is ready (screensaver only activates when ready) */
  isReady?: boolean;
  /** Whether a result overlay is active (suppress screensaver) */
  isOverlayActive?: boolean;
}

/**
 * Professional screensaver overlay for the check-in terminal.
 * Shows the Corpo & Evolução imagotipo centered on a black background
 * with a subtle white glow. Activates after `idleTimeout` seconds of
 * no motion detected in the camera feed. Dismisses automatically when
 * motion is detected.
 */
export function Screensaver({
  videoRef,
  idleTimeout = 10,
  isReady = true,
  isOverlayActive = false,
}: ScreensaverProps) {
  const [active, setActive] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);
  const lastMotionRef = useRef(Date.now());
  const prevFrameRef = useRef<ImageData | null>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  const MOTION_THRESHOLD = 25; // Pixel difference to count as "changed"
  const MOTION_PIXEL_COUNT = 800; // Min changed pixels to count as "motion"
  const SAMPLE_W = 160;
  const SAMPLE_H = 120;

  const detectMotion = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !motionCanvasRef.current) return false;

    const canvas = motionCanvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;

    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const currentFrame = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);

    if (!prevFrameRef.current) {
      prevFrameRef.current = currentFrame;
      return false;
    }

    const prev = prevFrameRef.current.data;
    const curr = currentFrame.data;
    let changedPixels = 0;

    // Compare every 4th pixel for performance (still checking ~25% of frame)
    for (let i = 0; i < curr.length; i += 16) {
      const dr = Math.abs(curr[i] - prev[i]);
      const dg = Math.abs(curr[i + 1] - prev[i + 1]);
      const db = Math.abs(curr[i + 2] - prev[i + 2]);
      if (dr + dg + db > MOTION_THRESHOLD * 3) {
        changedPixels++;
      }
    }

    prevFrameRef.current = currentFrame;
    return changedPixels > MOTION_PIXEL_COUNT / 4; // adjusted for sampling
  }, [videoRef]);

  useEffect(() => {
    if (!isReady || isOverlayActive) {
      setActive(false);
      setFadeIn(false);
      return;
    }

    // Create offscreen canvas for motion detection
    if (!motionCanvasRef.current) {
      motionCanvasRef.current = document.createElement("canvas");
    }

    let checkInterval: NodeJS.Timeout;

    const loop = () => {
      const hasMotion = detectMotion();

      if (hasMotion) {
        lastMotionRef.current = Date.now();
        if (active) {
          setFadeIn(false);
          // Small delay to let fade-out animation play
          setTimeout(() => setActive(false), 400);
        }
      }

      const elapsed = (Date.now() - lastMotionRef.current) / 1000;
      if (elapsed >= idleTimeout && !active && !isOverlayActive) {
        setActive(true);
        // Trigger fade-in after mount
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setFadeIn(true));
        });
      }
    };

    checkInterval = setInterval(loop, 300); // Check every 300ms

    return () => {
      clearInterval(checkInterval);
    };
  }, [isReady, isOverlayActive, active, idleTimeout, detectMotion]);

  // Reset motion timer on any touch/mouse event (manual wake)
  useEffect(() => {
    if (!active) return;

    const wake = () => {
      lastMotionRef.current = Date.now();
      setFadeIn(false);
      setTimeout(() => setActive(false), 400);
    };

    window.addEventListener("touchstart", wake, { passive: true });
    window.addEventListener("mousedown", wake);
    window.addEventListener("keydown", wake);

    return () => {
      window.removeEventListener("touchstart", wake);
      window.removeEventListener("mousedown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="screensaver-overlay"
      style={{
        opacity: fadeIn ? 1 : 0,
        transition: "opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Ambient glow layers */}
      <div className="screensaver-glow screensaver-glow--primary" />
      <div className="screensaver-glow screensaver-glow--secondary" />
      <div className="screensaver-glow screensaver-glow--tertiary" />

      {/* Logo container with breathing animation */}
      <div className="screensaver-logo-container">
        {/* Imagotipo SVG - Corpo & Evolução full wordmark */}
        <svg
          className="screensaver-logo"
          viewBox="0 0 2173 543"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M1079.88 60.3428C1082.94 60.3428 1106.26 22.0972 1109.53 0.00889007H979.661C950.687 -0.33198 885.581 9.00785 856.947 49.0941C844.335 67.5011 816.452 116.995 805.817 167.717C796.273 195.668 799.886 251.571 890.694 251.571H1005.23C1012.04 250.548 1027.93 237.663 1036.93 194.305H893.761C889.671 192.941 882.717 186.942 887.626 173.852C893.761 157.491 911.346 96.5068 924.44 80.795C934.666 68.5237 943.869 61.3654 962.276 60.3428C962.276 60.3428 1076.81 60.3428 1079.88 60.3428Z" fill="white"/>
          <path d="M1763.89 379.252C1765.91 379.252 1781.27 354.066 1783.43 339.521H1697.86C1678.77 339.297 1635.88 345.447 1617.01 371.844C1608.7 383.966 1590.33 416.558 1583.33 449.959C1577.04 468.365 1579.42 505.178 1639.25 505.178H1714.71C1719.2 504.504 1729.66 496.02 1735.59 467.467H1641.27C1638.57 466.569 1633.99 462.619 1637.23 453.999C1641.27 443.225 1652.85 403.066 1661.48 392.72C1668.22 384.639 1674.28 379.925 1686.41 379.252C1686.41 379.252 1761.87 379.252 1763.89 379.252Z" fill="white"/>
          <path fillRule="evenodd" clipRule="evenodd" d="M1138.16 71.5917C1138.16 71.5917 1217.93 71.5917 1243.49 71.5917C1269.06 71.5917 1296.26 89.1806 1286.44 126.813L1256.79 213.734C1244.52 236.232 1222.22 251.571 1153.5 251.571H1118.73C1084.65 252.253 1025.06 235.618 1055.33 167.717L1072.72 113.519C1078.85 100.566 1101.35 72.4098 1138.16 71.5917ZM1127.94 206.576H1183.16C1192.98 207.394 1197.48 201.463 1198.5 198.395L1217.93 139.084C1225.29 118.632 1214.86 114.2 1208.72 114.541H1161.68C1144.5 113.723 1138.16 121.7 1137.14 125.79L1114.64 192.26C1109.74 203.713 1121.46 206.576 1127.94 206.576Z" fill="white"/>
          <path fillRule="evenodd" clipRule="evenodd" d="M1186.25 343.605C1186.25 343.605 1257.86 343.605 1280.81 343.605C1303.76 343.605 1328.18 359.394 1319.37 393.173L1292.74 471.197C1281.73 491.391 1261.71 505.16 1200.02 505.16H1168.8C1138.2 505.772 1084.71 490.84 1111.88 429.89L1127.49 381.24C1133.05 367.125 1153.2 344.34 1186.25 343.605ZM1177.07 464.771H1226.64C1235.46 465.506 1239.5 460.182 1240.41 457.428L1257.86 404.188C1264.47 385.83 1255.1 381.852 1249.59 382.158H1207.36C1191.94 381.424 1186.25 388.584 1185.33 392.255L1165.13 451.92C1160.73 462.201 1171.25 464.771 1177.07 464.771Z" fill="white"/>
          <path fillRule="evenodd" clipRule="evenodd" d="M2037.06 343.605C2037.06 343.605 2108.67 343.605 2131.62 343.605C2154.57 343.605 2178.99 359.394 2170.18 393.173L2143.55 471.197C2132.54 491.391 2112.52 505.16 2050.83 505.16H2019.61C1989.01 505.772 1935.52 490.84 1962.69 429.89L1978.3 381.24C1983.81 369.613 2004.01 344.34 2037.06 343.605ZM2027.88 464.771H2077.45C2086.27 465.506 2090.31 460.182 2091.22 457.428L2108.67 404.188C2115.28 385.83 2105.91 381.852 2100.4 382.158H2058.17C2042.75 381.424 2037.06 388.584 2036.14 392.255L2015.94 451.92C2011.54 462.201 2022.06 464.771 2027.88 464.771Z" fill="white"/>
          <path fillRule="evenodd" clipRule="evenodd" d="M1725.28 71.5917C1725.28 71.5917 1805.04 71.5917 1830.6 71.5917C1856.17 71.5917 1883.37 89.1806 1873.55 126.813L1843.9 213.734C1831.63 236.232 1809.33 251.571 1740.61 251.571H1705.85C1671.76 252.253 1612.17 235.618 1642.44 167.717L1659.83 113.519C1665.96 100.566 1688.46 72.4098 1725.28 71.5917ZM1715.05 206.576H1770.27C1780.09 207.394 1784.59 201.463 1785.61 198.395L1805.04 139.084C1812.4 118.632 1801.97 114.2 1795.84 114.541H1748.8C1731.62 113.723 1725.28 121.7 1724.25 125.79L1701.76 192.26C1696.85 203.713 1708.57 206.576 1715.05 206.576Z" fill="white"/>
          <path d="M1445.97 71.5917H1370.3C1347.8 71.5918 1314.67 79.159 1304.85 113.519L1268.04 239.3C1267.01 243.049 1265.99 251.571 1270.08 251.571H1323.26C1327.35 251.571 1328.98 247.48 1331.44 239.3C1333.89 231.119 1353.59 164.308 1363.14 131.926C1363.82 127.835 1369.07 119.654 1384.61 119.654H1425.52C1429.27 119.654 1438.61 110.042 1445.97 71.5917Z" fill="white"/>
          <path d="M2106.58 77.7273H1981.82C1969.55 77.7273 1945.82 87.1353 1936.82 116.586L1912.28 199.418C1908.53 213.734 1910.44 242.572 1948.07 243.39H2047.26C2051.7 238.277 2060.76 223.347 2061.58 204.531H1976.7C1970.57 204.531 1961.36 203.508 1967.5 192.26L1974.66 176.92H2043.17C2046.92 171.126 2054.42 156.264 2054.42 143.174H1995.11C1982.84 143.174 1979.77 143.174 1983.86 133.971L1992.04 115.564H2089.19C2092.26 115.223 2100.03 107.178 2106.58 77.7273Z" fill="white"/>
          <path d="M990.908 278.159H800.618C783.812 278.159 751.32 291.051 738.996 331.41L705.384 444.92C700.249 464.539 702.863 504.057 754.401 505.178H903.987C910.055 498.171 922.296 477.711 923.416 451.926H793.615C785.212 451.926 772.608 450.525 781.011 435.11L790.477 415.188H900.919C908.077 410.075 919.326 385.783 919.326 367.845H818.824C802.018 367.845 797.817 367.845 803.419 355.233L814.623 330.009H967.388C971.59 329.542 981.945 318.518 990.908 278.159Z" fill="white"/>
          <path d="M1300.76 505.178H1328.37H1341.66C1349.84 505.178 1358.02 506.2 1365.18 473.477C1372.34 440.753 1416.31 308.837 1416.31 308.837C1399.95 308.837 1375.41 310.882 1388.7 278.158H1372.34C1368.59 277.477 1360.48 279.999 1358.02 295.543L1299.74 488.816C1298.71 493.929 1293.6 505.178 1300.76 505.178Z" fill="white"/>
          <path fillRule="evenodd" clipRule="evenodd" d="M1509.37 71.5917H1594.25C1622.88 71.5918 1657.65 80.7952 1640.26 128.858L1618.79 205.553C1605.5 232.141 1584.43 251.571 1549.25 251.571H1463.35L1454.15 288.385C1452.45 293.498 1444.54 301.474 1426.54 300.656H1414.27C1406.77 300.656 1392.38 297.793 1394.84 286.34L1417.34 197.373L1444.95 106.36C1449.04 92.0439 1466.01 71.5917 1509.37 71.5917ZM1519.6 114.541H1566.64C1581.36 114.541 1582.32 124.086 1580.95 128.858L1563.57 186.124C1558.66 202.486 1546.53 205.894 1541.07 205.553H1490.96C1477.87 207.19 1480.74 193.964 1483.81 187.147L1498.12 134.993C1503.03 117.814 1514.48 114.2 1519.6 114.541Z" fill="white"/>
          <path d="M978.636 503.132H1026.7C1028.4 503.132 1033.65 500.473 1041.02 489.838L1138.16 351.786C1141.91 347.355 1145.73 338.697 1131.01 339.515L1098.28 339.515C1095.9 339.515 1089.49 341.355 1082.94 348.718L1025.68 433.595C1014.43 450.979 1014.43 459.16 1012.38 436.663L1004.2 351.786C1003.18 341.56 1003.18 341.56 990.908 341.56H951.026C934.664 341.56 937.732 345.65 940.8 372.238L955.116 469.386C956.139 480.635 962.275 503.132 978.636 503.132Z" fill="white"/>
          <path d="M1846.83 321.108H1961.36C1964.77 321.79 1973.64 314.155 1981.82 278.159H1882.62C1868.31 279.522 1841.11 290.021 1846.83 321.108Z" fill="white"/>
          <path d="M1425.52 339.515H1445.97H1464.38C1467.79 339.175 1473.17 342.174 1467.44 356.9L1441.88 452.002C1440.86 455.411 1441.47 462.229 1452.11 462.229H1496.08C1500.17 462.229 1508.96 460.183 1511.42 452.002L1540.05 356.9C1541.75 351.105 1546.8 339.515 1553.34 339.515H1590.16C1594.59 339.175 1601.82 342.583 1595.27 358.945L1567.66 452.002C1563.57 470.069 1543.53 505.996 1496.08 505.178H1442.9C1419.04 505.178 1374.18 494.543 1385.64 452.002L1416.31 345.651C1417 343.606 1419.79 339.515 1425.52 339.515Z" fill="white"/>
          <path d="M1677.08 513.359C1673.67 523.244 1662.35 542.81 1644.36 541.992H1591.18C1592.2 532.447 1598.34 513.359 1614.7 513.359H1677.08Z" fill="white"/>
          <path fillRule="evenodd" clipRule="evenodd" d="M1791.61 380.419C1794.68 366.785 1808.79 339.515 1840.7 339.515H1924.55C1939.89 339.856 1969.55 348.105 1965.45 378.374L1938.87 487.793C1937.5 492.906 1931.5 503.133 1918.41 503.133H1793.66C1783.43 502.451 1762.16 496.588 1758.89 478.59V454.047C1761.27 437.686 1778.11 404.962 1826.38 404.962H1884.67C1891.83 403.94 1904.1 402.917 1904.1 396.781V385.533C1904.1 383.487 1900.01 379.397 1885.69 380.419H1791.61ZM1848.88 433.595H1894.89C1890.8 457.32 1875.47 462.569 1873.42 462.228H1821.27C1818.2 439.731 1834.56 433.595 1848.88 433.595Z" fill="white"/>
          <path d="M259.784 294.618C251.772 321.429 230.755 375.235 210.786 375.974H82.292C49.9345 376.591 -11.4522 361.922 1.86062 298.316L59.1795 147.623C73.047 113.417 132.215 45.0038 257.947 45.0038H703.555C691.228 75.8204 663.432 137.269 650.859 136.529H449.318C444.079 136.837 432.307 141.152 427.13 155.944L418.809 179.981C416.652 183.987 415.111 191.814 426.205 191.075H570.427C564.88 209.565 550.643 247.284 538.07 250.242H398.47C394.464 250.242 385.527 252.646 381.83 262.261L370.736 287.222C367.962 291.229 365.558 299.056 378.132 298.316H554.711C545.774 318.964 521.983 363.216 498.316 375.05H337.442L236.683 421.275C234.526 422.507 231.506 421.829 236.683 409.256L316.19 172.585C317.731 169.503 323.031 162.415 331.907 158.717L383.679 136.529H226.514C214.495 136.221 187.315 142.816 174.742 171.66L129.441 282.6C127.284 286.606 126.668 294.618 141.46 294.618H259.784Z" fill="white"/>
          <path d="M230.212 435.142L217.269 473.971L217.257 473.994C215.416 477.677 214.499 479.51 221.891 475.82L410.477 387.993C412.943 387.068 416.209 384.295 409.553 384.295H341.14L230.212 435.142Z" fill="white"/>
        </svg>

        {/* Subtle "Studio" text below */}
        <p className="screensaver-subtitle">STUDIO</p>
      </div>

      {/* Time display */}
      <ScreensaverClock />

      <style>{`
        .screensaver-overlay {
          position: fixed;
          inset: 0;
          z-index: 60;
          background: #000000;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          cursor: none;
        }

        /* Ambient glow effects */
        .screensaver-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          pointer-events: none;
        }
        .screensaver-glow--primary {
          width: 600px;
          height: 600px;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%);
          animation: screensaver-pulse 6s ease-in-out infinite;
        }
        .screensaver-glow--secondary {
          width: 400px;
          height: 400px;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(255,255,255,0.025) 0%, transparent 70%);
          animation: screensaver-pulse 8s ease-in-out 2s infinite;
        }
        .screensaver-glow--tertiary {
          width: 800px;
          height: 800px;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(255,255,255,0.015) 0%, transparent 60%);
          animation: screensaver-pulse 10s ease-in-out 4s infinite;
        }

        @keyframes screensaver-pulse {
          0%, 100% {
            opacity: 0.6;
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.08);
          }
        }

        /* Logo container */
        .screensaver-logo-container {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          animation: screensaver-breathe 5s ease-in-out infinite;
        }

        .screensaver-logo {
          width: min(65vw, 480px);
          height: auto;
          filter: drop-shadow(0 0 40px rgba(255,255,255,0.08))
                  drop-shadow(0 0 80px rgba(255,255,255,0.04));
        }

        .screensaver-subtitle {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.35em;
          color: rgba(255,255,255,0.18);
          text-align: center;
          margin: 0;
        }

        @keyframes screensaver-breathe {
          0%, 100% {
            opacity: 0.85;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.015);
          }
        }

        /* Clock */
        .screensaver-clock {
          position: absolute;
          bottom: 40px;
          left: 0;
          right: 0;
          text-align: center;
          z-index: 2;
        }
        .screensaver-clock__time {
          font-size: 48px;
          font-weight: 200;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.25);
          font-variant-numeric: tabular-nums;
          line-height: 1;
        }
        .screensaver-clock__date {
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.12em;
          color: rgba(255,255,255,0.12);
          text-transform: uppercase;
          margin-top: 8px;
        }
      `}</style>
    </div>
  );
}

/** Live clock display for the screensaver */
function ScreensaverClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const date = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="screensaver-clock">
      <div className="screensaver-clock__time">{time}</div>
      <div className="screensaver-clock__date">{date}</div>
    </div>
  );
}
