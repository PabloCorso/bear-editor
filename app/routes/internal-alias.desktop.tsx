import { Navigate, useParams } from "react-router";
import { parseInternalLevelNumber } from "~/levels/internal-levels";

export default function DesktopInternalAlias() {
  const { number: rawNumber } = useParams();
  if (rawNumber === undefined) return <Navigate replace to="/internal/1" />;
  const number = parseInternalLevelNumber(rawNumber);
  return number === null ? (
    <Navigate replace to="/internal/invalid" />
  ) : (
    <Navigate replace to={`/internal/${number}`} />
  );
}
