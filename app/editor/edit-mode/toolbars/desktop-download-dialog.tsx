import { useEffect, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  type DialogProps,
} from "~/components/ui/dialog";
import { cn } from "~/utils/misc";

const RELEASES_URL = "https://github.com/PabloCorso/bear-editor/releases";
const PLATFORMS = [
  { name: "macOS", extension: /\.dmg$/i },
  { name: "Windows", extension: /\.exe$/i },
  { name: "Linux", extension: /\.AppImage$/i },
] as const;

type Installer = { name: string; browser_download_url: string };

function detectedPlatform() {
  const agent = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/i.test(agent)) return null;
  // iPadOS can identify itself as a Mac.
  if (/Mac/i.test(agent) && navigator.maxTouchPoints > 1) return null;
  if (/Mac/i.test(agent)) return "macOS";
  if (/Windows/i.test(agent)) return "Windows";
  if (/Linux/i.test(agent)) return "Linux";
  return null;
}

export function DesktopDownloadDialog(props: DialogProps) {
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [status, setStatus] = useState("Loading downloads…");
  const [platform, setPlatform] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setPlatform(detectedPlatform());
    const controller = new AbortController();
    async function load() {
      setInstallers([]);
      setStatus("Loading downloads…");
      try {
        const response = await fetch(
          "https://api.github.com/repos/PabloCorso/bear-editor/releases/latest",
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          setStatus("Desktop downloads are not available yet.");
          return;
        }
        if (!response.ok) throw new Error("Release request failed");
        const release = (await response.json()) as { assets: Installer[] };
        const assets = release.assets.filter((asset) =>
          asset.browser_download_url.startsWith(`${RELEASES_URL}/download/`),
        );
        if (controller.signal.aborted) return;
        setInstallers(assets);
        setStatus("");
      } catch {
        if (!controller.signal.aborted)
          setStatus("Could not load downloads. Check GitHub Releases below.");
      }
    }
    void load();
    return () => controller.abort();
  }, [props.open]);

  return (
    <Dialog {...props}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader showCloseButton>
          <div>
            <DialogTitle>Download desktop app</DialogTitle>
            <DialogDescription className="mt-1 text-secondary">
              Use Bear Editor offline with native file access.
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="gap-3 pb-6">
          {status && (
            <p role="status" className="text-sm text-secondary">
              {status}
            </p>
          )}
          {PLATFORMS.map(({ name, extension }) => {
            const assets = installers.filter((asset) =>
              extension.test(asset.name),
            );
            return (
              <section
                key={name}
                className={cn(
                  "rounded-md border border-default p-3",
                  platform === name && "bg-primary",
                )}
              >
                <h3 className="text-sm font-bold">
                  {name}
                  {platform === name && (
                    <span className="ml-2 font-normal text-secondary">
                      Your OS
                    </span>
                  )}
                </h3>
                {assets.length ? (
                  assets.map((asset) => (
                    <a
                      key={asset.name}
                      href={asset.browser_download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block text-sm break-all underline underline-offset-4"
                    >
                      {asset.name}
                    </a>
                  ))
                ) : (
                  <p className="mt-1 text-xs text-secondary">
                    {status === "Loading downloads…"
                      ? "Loading…"
                      : "No installer available"}
                  </p>
                )}
              </section>
            );
          })}
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline underline-offset-4"
          >
            All releases on GitHub
          </a>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
