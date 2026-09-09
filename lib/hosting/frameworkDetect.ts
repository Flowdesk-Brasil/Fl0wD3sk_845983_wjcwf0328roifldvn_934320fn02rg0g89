export type HostingFrameworkId =
  | "nextjs"
  | "nuxt"
  | "remix"
  | "astro"
  | "sveltekit"
  | "nestjs"
  | "vite"
  | "cra"
  | "express"
  | "node"
  | "python"
  | "static"
  | "unknown";

export type HostingFrameworkRecipe = {
  id: HostingFrameworkId;
  label: string;
  installCommand: string;
  buildCommand: string | null;
  startCommand: string;
  outputDir: string | null;
  packageManager: "npm" | "pip";
};

type PackageJson = {
  main?: unknown;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function hasFile(files: string[], name: string) {
  const needle = name.toLowerCase();
  return files.some((file) => file.toLowerCase() === needle || file.toLowerCase().endsWith(`/${needle}`));
}

function hasAnyFile(files: string[], names: string[]) {
  return names.some((name) => hasFile(files, name));
}

function hasDep(pkg: PackageJson | null, name: string) {
  return Boolean(pkg?.dependencies?.[name] || pkg?.devDependencies?.[name]);
}

function scriptOf(pkg: PackageJson | null, name: string) {
  const value = pkg?.scripts?.[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function detectHostingFramework(input: {
  files?: string[];
  packageJson?: PackageJson | null;
}): HostingFrameworkRecipe {
  const files = (input.files || []).map((item) => item.replace(/^\/+/, ""));
  const pkg = input.packageJson || null;
  const startScript = scriptOf(pkg, "start");
  const buildScript = scriptOf(pkg, "build");

  if (hasAnyFile(files, ["next.config.ts", "next.config.js", "next.config.mjs", "next.config.cjs"]) || hasDep(pkg, "next")) {
    return {
      id: "nextjs",
      label: "Next.js",
      installCommand: "npm install --production=false",
      buildCommand: buildScript ? "npm run build" : "npx next build",
      startCommand: "npx next start -H 0.0.0.0 -p $PORT",
      outputDir: ".next",
      packageManager: "npm",
    };
  }

  if (hasAnyFile(files, ["nuxt.config.ts", "nuxt.config.js"]) || hasDep(pkg, "nuxt")) {
    return {
      id: "nuxt",
      label: "Nuxt",
      installCommand: "npm install --production=false",
      buildCommand: buildScript ? "npm run build" : "npx nuxt build",
      startCommand: startScript ? "npm start" : "npx nuxt start --port $PORT --hostname 0.0.0.0",
      outputDir: ".output",
      packageManager: "npm",
    };
  }

  if (hasAnyFile(files, ["remix.config.js", "remix.config.ts"]) || hasDep(pkg, "@remix-run/node") || hasDep(pkg, "@remix-run/react")) {
    return {
      id: "remix",
      label: "Remix",
      installCommand: "npm install --production=false",
      buildCommand: buildScript ? "npm run build" : null,
      startCommand: startScript ? "npm start" : "npx remix-serve build/server/index.js",
      outputDir: "build",
      packageManager: "npm",
    };
  }

  if (hasAnyFile(files, ["astro.config.ts", "astro.config.mjs", "astro.config.js"]) || hasDep(pkg, "astro")) {
    return {
      id: "astro",
      label: "Astro",
      installCommand: "npm install --production=false",
      buildCommand: buildScript ? "npm run build" : "npx astro build",
      startCommand: startScript ? "npm start" : "npx astro preview --host 0.0.0.0 --port $PORT",
      outputDir: "dist",
      packageManager: "npm",
    };
  }

  if (hasAnyFile(files, ["svelte.config.js", "svelte.config.ts"]) || hasDep(pkg, "@sveltejs/kit")) {
    return {
      id: "sveltekit",
      label: "SvelteKit",
      installCommand: "npm install --production=false",
      buildCommand: buildScript ? "npm run build" : null,
      startCommand: startScript ? "npm start" : "node build",
      outputDir: "build",
      packageManager: "npm",
    };
  }

  if (hasAnyFile(files, ["nest-cli.json"]) || hasDep(pkg, "@nestjs/core")) {
    return {
      id: "nestjs",
      label: "NestJS",
      installCommand: "npm install --production=false",
      buildCommand: buildScript ? "npm run build" : "npx nest build",
      startCommand: startScript ? "npm start" : "node dist/main.js",
      outputDir: "dist",
      packageManager: "npm",
    };
  }

  if (hasAnyFile(files, ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs"]) || hasDep(pkg, "vite")) {
    return {
      id: "vite",
      label: "Vite",
      installCommand: "npm install --production=false",
      buildCommand: buildScript ? "npm run build" : "npx vite build",
      startCommand: "npx vite preview --host 0.0.0.0 --port $PORT",
      outputDir: "dist",
      packageManager: "npm",
    };
  }

  if (hasDep(pkg, "react-scripts")) {
    return {
      id: "cra",
      label: "Create React App",
      installCommand: "npm install --production=false",
      buildCommand: buildScript ? "npm run build" : "npx react-scripts build",
      startCommand: startScript ? "npm start" : "npx serve -s build -l $PORT",
      outputDir: "build",
      packageManager: "npm",
    };
  }

  if (hasDep(pkg, "express") || hasDep(pkg, "fastify") || hasDep(pkg, "koa")) {
    return {
      id: "express",
      label: hasDep(pkg, "fastify") ? "Fastify" : "Express",
      installCommand: "npm install --production=false",
      buildCommand: buildScript && !/dev|watch/i.test(buildScript) ? "npm run build" : null,
      startCommand: startScript ? "npm start" : typeof pkg?.main === "string" ? `node ${pkg.main}` : "node index.js",
      outputDir: null,
      packageManager: "npm",
    };
  }

  if (pkg) {
    return {
      id: "node",
      label: "Node.js",
      installCommand: "npm install --production=false",
      buildCommand: buildScript && !/dev|watch/i.test(buildScript) ? "npm run build" : null,
      startCommand: startScript ? "npm start" : typeof pkg.main === "string" ? `node ${pkg.main}` : "node index.js",
      outputDir: null,
      packageManager: "npm",
    };
  }

  if (hasAnyFile(files, ["requirements.txt", "pyproject.toml", "main.py", "app.py", "bot.py"])) {
    const entry = hasFile(files, "app.py") ? "app.py" : hasFile(files, "bot.py") ? "bot.py" : "main.py";
    return {
      id: "python",
      label: "Python",
      installCommand: hasFile(files, "requirements.txt") ? "pip3 install -r requirements.txt" : "true",
      buildCommand: null,
      startCommand: `python3 ${entry}`,
      outputDir: null,
      packageManager: "pip",
    };
  }

  if (hasFile(files, "index.html")) {
    return {
      id: "static",
      label: "Static",
      installCommand: "true",
      buildCommand: null,
      startCommand: "npx serve -s . -l $PORT",
      outputDir: ".",
      packageManager: "npm",
    };
  }

  return {
    id: "unknown",
    label: "App",
    installCommand: "true",
    buildCommand: null,
    startCommand: "node index.js",
    outputDir: null,
    packageManager: "npm",
  };
}

export function isHostingFrameworkRecipe(value: unknown): value is HostingFrameworkRecipe {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.label === "string" && typeof record.startCommand === "string";
}

export function readHostingFramework(payload: unknown): HostingFrameworkRecipe | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  if (isHostingFrameworkRecipe(root.framework)) return root.framework;
  if (root.vpsSettings && typeof root.vpsSettings === "object" && !Array.isArray(root.vpsSettings)) {
    const settings = root.vpsSettings as Record<string, unknown>;
    if (isHostingFrameworkRecipe(settings.framework)) return settings.framework;
  }
  return null;
}

export function isSafeHostingCommand(command: string) {
  return /^(npm|npx|node|python3|pip3|true)\b/.test(command.trim());
}
