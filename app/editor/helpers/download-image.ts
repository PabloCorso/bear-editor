export function getImageFileName(levelFileName?: string) {
  const name = (levelFileName ?? "level")
    .replace(/\.(lev|png)$/i, "")
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, "_")
    .replace(/[. ]+$/, "")
    .trim();
  return `${name || "level"}.png`;
}

export function downloadImage(blob: Blob, fileName?: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getImageFileName(fileName);
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Let the browser start consuming the download before releasing its URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
