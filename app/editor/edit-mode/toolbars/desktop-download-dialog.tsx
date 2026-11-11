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
          setStatus("Downloads aren’t available yet.");
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

  const visiblePlatforms = platform
    ? PLATFORMS.filter(({ name }) => name === platform)
    : PLATFORMS;
  const downloads = visiblePlatforms.flatMap(({ name, extension }) => {
    const installer = installers.find((asset) => extension.test(asset.name));
    return installer ? [{ name, installer }] : [];
  });

  return (
    <Dialog {...props}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader showCloseButton>
          <DialogTitle>Bear Editor for desktop</DialogTitle>
        </DialogHeader>
        <DialogBody className="gap-3 pb-6">
          {status && (
            <p role="status" className="text-sm text-secondary">
              {status}
            </p>
          )}
          {!status && downloads.length === 0 && (
            <p role="status" className="text-sm text-secondary">
              Downloads aren’t available yet.
            </p>
          )}
          {!status &&
            downloads.map(({ name, installer }) => (
              <div key={name}>
                <Button
                  as="a"
                  href={installer.browser_download_url}
                  variant="accent"
                  className="w-full"
                >
                  Download for {name}
                </Button>
                {name === "macOS" && (
                  <p className="mt-2 text-xs text-secondary">
                    First time: Control-click the app and choose Open.
                  </p>
                )}
              </div>
            ))}
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline underline-offset-4"
          >
            Other platforms and versions
          </a>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
