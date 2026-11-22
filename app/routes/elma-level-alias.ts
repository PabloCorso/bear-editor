import { redirect } from "react-router";
import type { Route } from "./+types/elma-level-alias";

export function loader({ params }: Route.LoaderArgs) {
  const id = Number(params.id);
  if (!/^\d+$/.test(params.id) || !Number.isSafeInteger(id) || id <= 0) {
    throw new Response("Invalid level ID.", {
      status: 404,
      statusText: "Invalid level ID.",
    });
  }
  return redirect(`/level/${id}`, 301);
}
