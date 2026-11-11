import { redirect } from "react-router";
import type { Route } from "./+types/internal-level";
import {
  getInternalLevelAssetName,
  getInternalLevelName,
  parseInternalLevelNumber,
} from "~/levels/internal-levels";
import { EditorPage } from "~/routes/home";

export function loader({ params }: Route.LoaderArgs) {
  const rawNumber = params.number;
  const number = parseInternalLevelNumber(rawNumber);
  if (number === null) {
    throw new Response("Invalid internal level number.", {
      status: 404,
      statusText: "Invalid internal level number.",
    });
  }
  if (rawNumber !== String(number)) {
    return redirect(`/internal/${number}`, 301);
  }
  return { number };
}

export function meta({ data }: Route.MetaArgs) {
  const name = data ? getInternalLevelName(data.number) : "Internal level";
  return [
    { title: `${name} · Bear Level Editor` },
    { name: "description", content: `Edit ${name} in Bear Editor.` },
  ];
}

export default function InternalLevel({ loaderData }: Route.ComponentProps) {
  return (
    <EditorPage
      key={loaderData.number}
      initialLevel={{
        kind: "builtin",
        name: getInternalLevelAssetName(loaderData.number),
        displayName: getInternalLevelName(loaderData.number),
      }}
    />
  );
}
