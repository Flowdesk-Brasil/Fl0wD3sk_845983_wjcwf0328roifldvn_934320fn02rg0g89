import { readFileSync } from "fs";
import { join } from "path";
import { buildUncompressedZip } from "@/lib/servers/simpleZip";

const PACK_FILES = [
  "index.js",
  "executor.js",
  "package.json",
  "start.cmd",
  "start.sh",
  "Liberar-Firewall.cmd",
  "Liberar-Firewall.sh",
  "README.txt",
] as const;

function packDir() {
  return join(process.cwd(), "lib", "servers", "whitelist-agent-files");
}

export function buildWhitelistAgentZip(input: {
  apiUrl: string;
  publicId: string;
  token: string;
}) {
  const files = PACK_FILES.map((name) => ({
    name: `FlowDesk-Whitelist-Agent/${name}`,
    content: readFileSync(join(packDir(), name)),
  }));
  files.push({
    name: "FlowDesk-Whitelist-Agent/agent.json",
    content: Buffer.from(JSON.stringify(
      {
        apiUrl: input.apiUrl,
        publicId: input.publicId,
        token: input.token,
        db: {
          engine: "mysql",
          host: "127.0.0.1",
          port: 3306,
          database: "",
          user: "",
          password: "",
          ssl: false,
        },
      },
      null,
      2,
    )),
  });
  return buildUncompressedZip(files);
}
