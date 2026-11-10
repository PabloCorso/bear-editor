import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const desktopRoot = path.dirname(new URL(import.meta.url).pathname);
const repositoryRoot = path.dirname(desktopRoot);
const require = createRequire(path.join(repositoryRoot, "package.json"));
const desktopRequire = createRequire(path.join(desktopRoot, "package.json"));
const reactRouterCli = path.join(
  path.dirname(require.resolve("@react-router/dev/package.json")),
  "bin.js",
);
const electron = desktopRequire("electron");
const devUrl = "http://127.0.0.1:5173";
const testUpdate = process.argv.includes("--test-update");

const server = spawn(
  process.execPath,
  [
    reactRouterCli,
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      BEAR_DESKTOP: "1",
      VITE_UMAMI_WEBSITE_ID: "",
    },
    stdio: "inherit",
  },
);

let electronProcess;

function stop() {
  electronProcess?.kill();
  server.kill();
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);
process.once("exit", stop);

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null)
      throw new Error("Desktop development server stopped before starting.");
    try {
      const response = await fetch(devUrl);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Desktop development server did not start at ${devUrl}.`);
}

try {
  await waitForServer();
  electronProcess = spawn(electron, [desktopRoot], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      BEAR_DESKTOP_DEV_URL: devUrl,
      ...(testUpdate ? { BEAR_DESKTOP_TEST_UPDATE: "1" } : {}),
    },
    stdio: "inherit",
  });
  electronProcess.once("exit", (code) => {
    server.kill();
    process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error(error.message);
  stop();
  process.exitCode = 1;
}
