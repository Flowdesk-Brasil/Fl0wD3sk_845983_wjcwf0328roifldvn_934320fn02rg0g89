import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const envVars = envContent.split("\n").reduce((acc, line) => {
  const [key, ...value] = line.split("=");
  if (key && value) acc[key.trim()] = value.join("=").trim().replace(/^"|"$/g, "");
  return acc;
}, {} as Record<string, string>);

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data, error } = await supabase.rpc("exec_sql", { query: "ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url text;" });
  if (error && error.message.includes("function exec_sql does not exist")) {
    console.log("No exec_sql function. I will create an edge function or just assume I can't do DDL this way.");
  } else {
    console.log("Migration executed:", error ? error.message : "Success");
  }
}
main();
