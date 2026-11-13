import { useEffect, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  type DialogProps,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";

const RELEASES_URL = "https://github.com/PabloCorso/bear-editor/releases";
const LOADING = "Loading downloads…";
const UNAVAILABLE = "Downloads aren’t available yet.";
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
  const [status, setStatus] = useState(LOADING);
  const [platform, setPlatform] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setPlatform(detectedPlatform());
    const controller = new AbortController();
    async function load() {
      setInstallers([]);
      setStatus(LOADING);
      try {
        const response = await fetch(
          "https://api.github.com/repos/PabloCorso/bear-editor/releases/latest",
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          setStatus(UNAVAILABLE);
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
          setStatus("Downloads couldn’t be loaded.");
      }
    }
    void load();
    return () => controller.abort();
  }, [props.open]);

  const downloads = PLATFORMS.map(({ name, extension }) => ({
    name,
    installer: installers.find((asset) => extension.test(asset.name)),
  }));
  const primary =
    downloads.find(({ name, installer }) => name === platform && installer) ??
    downloads.find(({ installer }) => installer);
  const message = status || (!primary ? UNAVAILABLE : "");

  return (
    <Dialog {...props}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader showCloseButton>
          <DialogTitle>Bear Editor for desktop</DialogTitle>
        </DialogHeader>
        <DialogBody className="gap-3 pb-6">
          {message && (
            <p role="status" className="text-sm text-secondary">
              {message}
            </p>
          )}
          {!status && primary?.installer && (
            <div>
              <Button
                as="a"
                href={primary.installer.browser_download_url}
                variant="accent"
                className="w-full"
              >
                Download for {primary.name}
              </Button>
              {primary.name === "macOS" && (
                <p className="mt-2 text-xs text-secondary">
                  First time: Control-click the app and choose Open.
                </p>
              )}
            </div>
          )}
          {!status && primary && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {downloads
                .filter(({ name }) => name !== primary.name)
                .map(({ name, installer }) => (
                  <a
                    key={name}
                    href={installer?.browser_download_url ?? RELEASES_URL}
                    className="underline underline-offset-4"
                  >
                    {name}
                  </a>
                ))}
            </div>
          )}
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline underline-offset-4"
          >
            GitHub Releases
          </a>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
