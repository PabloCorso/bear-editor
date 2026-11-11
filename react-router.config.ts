import type { Config } from "@react-router/dev/config";

const desktop = process.env.BEAR_DESKTOP === "1";

export default {
  ssr: !desktop,
  buildDirectory: desktop ? "desktop/build" : "build",
} satisfies Config;
