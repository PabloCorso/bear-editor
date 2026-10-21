import type { ElmaLevel } from "../elma-types";
import { trackEvent } from "~/analytics";

export function levelToBlob(level: ElmaLevel): Blob {
  const buffer = level.toBuffer();
  const uint8Array = new Uint8Array(buffer);
  return new Blob([uint8Array], { type: "application/octet-stream" });
}

export function downloadLevel(level: ElmaLevel) {
  const blob = levelToBlob(level);
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${level.name}.lev`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  trackEvent("level_saved");
}
