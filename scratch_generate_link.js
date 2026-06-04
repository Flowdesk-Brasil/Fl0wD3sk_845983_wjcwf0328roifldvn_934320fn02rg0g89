const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...val] = line.split('=');
  if (key) acc[key.trim()] = val.join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co",
  env.SUPABASE_SERVICE_ROLE_KEY || "dummy"
);

async function test() {
  const email = "test@example.com";
  
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: "https://corpoeevolucao.vercel.app/reset-password" },
  });
  
  console.log("Data:", data);
  console.log("Error:", error);
}

test();
