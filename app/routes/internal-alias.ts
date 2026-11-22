import { redirect } from "react-router";
import type { Route } from "./+types/internal-alias";
import { parseInternalLevelNumber } from "~/levels/internal-levels";

export function loader({ params }: Route.LoaderArgs) {
  if (params.number === undefined) return redirect("/internal", 302);
  const number = parseInternalLevelNumber(params.number);
  if (number === null) {
    throw new Response("Invalid internal level number.", {
      status: 404,
      statusText: "Invalid internal level number.",
    });
  }
  return redirect(`/internal/${number}`, 301);
}
