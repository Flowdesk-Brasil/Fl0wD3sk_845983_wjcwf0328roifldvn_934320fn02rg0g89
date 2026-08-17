import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const FORBIDDEN_PUBLIC_BUNDLE_PATTERNS = [
  /SUPABASE_SERVICE_ROLE/i,
  /SERVICE_ROLE_KEY/i,
  /AUTH_COOKIE_SECRET/i,
  /AUTH_SMTP_PASS/i,
  /AUTH_SMTP_USER/i,
  /GOOGLE_CLIENT_SECRET/i,
  /DISCORD_CLIENT_SECRET/i,
  /MICROSOFT_CLIENT_SECRET/i,
  /MERCADOPAGO_ACCESS_TOKEN/i,
  /FLOWSECURE_MASTER/i,
  /POSTGRES_PASSWORD/i,
  /DATABASE_URL/i,
] as const;

function walkFiles(root: string, output: string[] = []) {
  if (!fs.existsSync(root)) return output;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, output);
      continue;
    }

    if (/\.(?:js|css|html|json|map)$/i.test(entry.name)) {
      output.push(fullPath);
    }
  }

  return output;
}

function walkSourceFiles(root: string, output: string[] = []) {
  if (!fs.existsSync(root)) return output;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(fullPath, output);
      continue;
    }

    if (/\.(?:ts|tsx|js|jsx)$/i.test(entry.name)) {
      output.push(fullPath);
    }
  }

  return output;
}

function latestMtimeMs(paths: string[]) {
  let latest = 0;
  for (const currentPath of paths) {
    if (!fs.existsSync(currentPath)) continue;
    const stat = fs.statSync(currentPath);
    if (stat.isDirectory()) {
      const nested = walkSourceFiles(currentPath).map((filePath) =>
        fs.statSync(filePath).mtimeMs,
      );
      latest = Math.max(latest, ...nested, stat.mtimeMs);
      continue;
    }
    latest = Math.max(latest, stat.mtimeMs);
  }
  return latest;
}

function isStaticBuildFresh() {
  const buildIdPath = path.resolve(".next", "BUILD_ID");
  if (!fs.existsSync(buildIdPath)) return false;
  const buildMtime = fs.statSync(buildIdPath).mtimeMs;
  const sourceMtime = latestMtimeMs([
    path.resolve("app"),
    path.resolve("components"),
    path.resolve("lib"),
    path.resolve("proxy.ts"),
    path.resolve("next.config.ts"),
  ]);
  return buildMtime >= sourceMtime;
}

test("public build artifacts do not contain private environment variable names", () => {
  const staticRoot = path.resolve(".next", "static");
  if (!isStaticBuildFresh()) {
    return;
  }
  const publicFiles = walkFiles(staticRoot);

  for (const filePath of publicFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    for (const pattern of FORBIDDEN_PUBLIC_BUNDLE_PATTERNS) {
      assert.doesNotMatch(
        content,
        pattern,
        `Forbidden private env reference leaked into ${path.relative(process.cwd(), filePath)}`,
      );
    }
  }
});

test("client components do not reference private process.env names directly", () => {
  const sourceFiles = [
    ...walkSourceFiles(path.resolve("app")),
    ...walkSourceFiles(path.resolve("components")),
  ];

  for (const filePath of sourceFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    if (!/["']use client["']/.test(content) || !content.includes("process.env")) {
      continue;
    }

    for (const pattern of FORBIDDEN_PUBLIC_BUNDLE_PATTERNS) {
      assert.doesNotMatch(
        content,
        pattern,
        `Client component references private env in ${path.relative(process.cwd(), filePath)}`,
      );
    }
  }
});
