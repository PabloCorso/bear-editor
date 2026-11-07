import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import path from "node:path";

const require = createRequire(import.meta.url);
const cli = path.join(
  path.dirname(require.resolve("@react-router/dev/package.json")),
  "bin.js",
);
const build = spawnSync(process.execPath, [cli, "build"], {
  env: { ...process.env, BEAR_DESKTOP: "1", VITE_UMAMI_WEBSITE_ID: "" },
  stdio: "inherit",
});
if (build.error) throw build.error;
process.exitCode = build.status ?? 1;
