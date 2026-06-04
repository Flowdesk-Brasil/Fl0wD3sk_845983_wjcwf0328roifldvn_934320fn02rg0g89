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
  const { data, error } = await supabase.storage.listBuckets();
  console.log(data?.map(b => b.name));
  
  if (!data?.find(b => b.name === 'student-photos')) {
    const { error: err2 } = await supabase.storage.createBucket('student-photos', { public: true });
    console.log("Created bucket:", err2 ? err2 : "Success");
  }
}
main();
