import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const isStorybook = process.env.npm_lifecycle_event?.includes("storybook");

// Chrome probes this URL for automatic workspace discovery during development.
const chromeDevtoolsProbe: Plugin = {
  name: "chrome-devtools-probe",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (
        request.url?.split("?")[0] !==
        "/.well-known/appspecific/com.chrome.devtools.json"
      ) {
        next();
        return;
      }

      response.statusCode = 404;
      response.end();
    });
  },
};

export default defineConfig(async ({ mode }) => {
  const plugins = [chromeDevtoolsProbe, tailwindcss(), tsconfigPaths()];

  // Only load React Router + Netlify when actually needed
  if (!isStorybook && mode !== "test") {
    const { reactRouter } = await import("@react-router/dev/vite");
    plugins.push(reactRouter());
    if (process.env.BEAR_DESKTOP !== "1") {
      const netlify = await import("@netlify/vite-plugin-react-router");
      plugins.push(netlify.default());
    }
  }

  return {
    plugins,
  };
});
