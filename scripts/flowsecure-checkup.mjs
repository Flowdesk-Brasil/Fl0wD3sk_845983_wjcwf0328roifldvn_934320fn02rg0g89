import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(process.cwd());
const sourceGlobs = [
  "app",
  "components",
  "lib",
];

const findings = [];

function pushFinding(severity, message, file = null) {
  findings.push({
    severity,
    message,
    file,
  });
}

function walk(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") {
        continue;
      }
      files.push(...walk(fullPath));
      continue;
    }

    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function readProjectFiles() {
  return sourceGlobs.flatMap((segment) => walk(path.join(rootDir, segment)));
}

function scanForDangerousPatterns(files) {
  const dangerousPatterns = [
    {
      pattern: /dangerouslySetInnerHTML/,
      message: "Uso de dangerouslySetInnerHTML detectado.",
      severity: "high",
    },
    {
      pattern: /\binnerHTML\s*=/,
      message: "Atribuicao direta a innerHTML detectada.",
      severity: "high",
    },
    {
      pattern: /\beval\s*\(/,
      message: "Uso de eval detectado.",
      severity: "critical",
    },
    {
      pattern: /\bnew Function\s*\(/,
      message: "Uso de new Function detectado.",
      severity: "critical",
    },
  ];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const entry of dangerousPatterns) {
      if (entry.pattern.test(content)) {
        pushFinding(entry.severity, entry.message, file);
      }
    }
  }
}

function scanSensitiveRoutesForRawJson(files) {
  const sensitiveRoutePattern =
    /app[\\/]+api[\\/]+auth|app[\\/]+api[\\/]+payments|app[\\/]+api[\\/]+internal/i;

  for (const file of files) {
    if (!sensitiveRoutePattern.test(file)) {
      continue;
    }

    const content = fs.readFileSync(file, "utf8");
    if (!/request\.json\s*\(/.test(content)) {
      continue;
    }

    if (!/parseFlowSecureDto(?:<[^>]+>)?\s*\(/.test(content)) {
      pushFinding(
        "medium",
        "Rota sensivel com request.json sem parseFlowSecureDto detectado.",
        file,
      );
    }
  }
}

function scanSecurityFallbacks() {
  const masterKey = process.env.FLOWSECURE_MASTER_KEY || process.env.FLOWSECURE_MASTER_SECRET;
  const passwordPepper = process.env.AUTH_PASSWORD_PEPPER;

  if (!masterKey) {
    pushFinding(
      "high",
      "FLOWSECURE_MASTER_KEY/FLOWSECURE_MASTER_SECRET ausente no ambiente atual.",
    );
  }

  if (!passwordPepper) {
    pushFinding(
      "high",
      "AUTH_PASSWORD_PEPPER ausente no ambiente atual.",
    );
  }
}

async function runDastCheck() {
  const targetUrl = process.env.FLOWSECURE_DAST_URL?.trim();
  if (!targetUrl) {
    return;
  }

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      redirect: "manual",
    });
    const csp = response.headers.get("content-security-policy");
    const hsts = response.headers.get("strict-transport-security");
    const frame = response.headers.get("x-frame-options");

    if (!csp) {
      pushFinding("high", "DAST: Content-Security-Policy ausente.", targetUrl);
    }

    if (!hsts && targetUrl.startsWith("https://")) {
      pushFinding("high", "DAST: Strict-Transport-Security ausente.", targetUrl);
    }

    if (!frame) {
      pushFinding("medium", "DAST: X-Frame-Options ausente.", targetUrl);
    }
  } catch (error) {
    pushFinding(
      "medium",
      `DAST: falha ao consultar ${targetUrl}: ${
        error instanceof Error ? error.message : "unknown_error"
      }`,
      targetUrl,
    );
  }
}

function printSummary() {
  const severityOrder = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  findings.sort(
    (left, right) => severityOrder[left.severity] - severityOrder[right.severity],
  );

  if (!findings.length) {
    console.log("FlowSecure Checkup: OK");
    return;
  }

  console.log("FlowSecure Checkup: findings");
  for (const finding of findings) {
    const location = finding.file ? ` [${path.relative(rootDir, finding.file)}]` : "";
    console.log(`- ${finding.severity.toUpperCase()}: ${finding.message}${location}`);
  }
}

async function main() {
  const files = readProjectFiles();
  scanForDangerousPatterns(files);
  scanSensitiveRoutesForRawJson(files);
  scanSecurityFallbacks();
  await runDastCheck();
  printSummary();

  if (findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) {
    process.exitCode = 1;
  }
}

await main();
