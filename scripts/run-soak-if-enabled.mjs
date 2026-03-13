import { spawnSync } from "node:child_process";

function isEnabled(value) {
  return /^(1|true|yes|on)$/i.test(value ?? "");
}

if (!isEnabled(process.env.SOAK_TESTS)) {
  console.log("[check:release] Skipping soak test (set SOAK_TESTS=1 to enable).");
  process.exit(0);
}

console.log("[check:release] Running soak test...");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["run", "test:soak"], {
  stdio: "inherit",
  env: process.env
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}

process.exit(1);
