import { Navigate, useParams } from "react-router";
import {
  getInternalLevelAssetName,
  getInternalLevelName,
  parseInternalLevelNumber,
} from "~/levels/internal-levels";
import { EditorPage } from "~/routes/home";

export default function DesktopInternalLevel() {
  const { number: rawNumber } = useParams();
  if (rawNumber === undefined) return <Navigate replace to="/internal/1" />;
  const number = parseInternalLevelNumber(rawNumber);
  if (number === null) return <DesktopRouteError />;
  if (rawNumber !== String(number)) {
    return <Navigate replace to={`/internal/${number}`} />;
  }
  return (
    <EditorPage
      key={number}
      initialLevel={{
        kind: "builtin",
        name: getInternalLevelAssetName(number),
        displayName: getInternalLevelName(number),
      }}
    />
  );
}

function DesktopRouteError() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Unable to open level</h1>
        <p className="mt-2 text-sm text-secondary">
          Invalid internal level number.
        </p>
      </div>
    </main>
  );
}
