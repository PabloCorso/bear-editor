import { useEffect, useState } from "react";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "~/components/ui/button";
import { CanvasTip } from "~/editor/edit-mode/toolbars/canvas-tip";

const DISMISSED_UPDATE_KEY = "bear-editor-dismissed-update";

export function DesktopUpdate() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    const desktop = window.bearDesktop;
    if (!desktop) return;
    const showUpdate = (downloadedVersion: string) => {
      if (sessionStorage.getItem(DISMISSED_UPDATE_KEY) !== downloadedVersion) {
        setVersion(downloadedVersion);
      }
    };
    const unsubscribe = desktop.onUpdateReady(showUpdate);
    void desktop.updateReady().then((downloadedVersion) => {
      if (downloadedVersion) showUpdate(downloadedVersion);
    });
    return unsubscribe;
  }, []);
  if (!version) return null;
  return (
    <CanvasTip role="status">
      <span className="pr-2 pl-2.5">Update: {version} is ready</span>
      <Button
        size="sm"
        variant="accent"
        className="m-0.5 h-6 rounded-full px-2.5"
        onClick={() => window.bearDesktop?.restartToUpdate()}
      >
        Restart to update
      </Button>
      <Button
        type="button"
        size="sm"
        iconOnly
        aria-label={`Dismiss update ${version}`}
        title="Dismiss update"
        className="-mr-1 h-6 w-6 rounded-full bg-transparent hover:text-primary"
        onClick={() => {
          sessionStorage.setItem(DISMISSED_UPDATE_KEY, version);
          setVersion(null);
        }}
      >
        <XIcon />
      </Button>
    </CanvasTip>
  );
}
