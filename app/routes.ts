import { index, type RouteConfig, route } from "@react-router/dev/routes";

const desktop = process.env.BEAR_DESKTOP === "1";

export default (desktop
  ? [
      index("routes/home.tsx"),
      route("internal/:number?", "routes/internal-level.desktop.tsx"),
      route("int/:number?", "routes/internal-alias.desktop.tsx"),
    ]
  : [
      index("routes/home.tsx"),
      route("level/:id", "routes/elma-level.tsx"),
      route("lev/:id", "routes/elma-level-alias.ts"),
      route("internal", "routes/internal-index.ts"),
      route("internal/:number", "routes/internal-level.tsx"),
      route("int/:number?", "routes/internal-alias.ts"),
    ]) satisfies RouteConfig;
