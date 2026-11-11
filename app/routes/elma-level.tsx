import type { Route } from "./+types/elma-level";
import { EditorPage } from "~/routes/home";

export function loader({ params }: Route.LoaderArgs) {
  const levelIndex = parseLevelIndex(params.id);
  if (levelIndex === null) {
    throw routeError(404, "Invalid level ID.");
  }
  return { levelIndex };
}

export function meta() {
  return [{ title: "Elma Online level · Bear Level Editor" }];
}

export default function ElmaLevel({ loaderData }: Route.ComponentProps) {
  return (
    <EditorPage
      key={loaderData.levelIndex}
      initialLevel={{ kind: "elma-online", id: loaderData.levelIndex }}
    />
  );
}

function parseLevelIndex(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function routeError(status: number, message: string) {
  return new Response(message, { status, statusText: message });
}
