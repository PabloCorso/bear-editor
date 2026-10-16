import { useLocalStorage } from "@mantine/hooks";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { supportsFilePickers } from "~/editor/helpers/file-session";
import {
  useEditorIsPlayMode,
  useEditorLevelFolderName,
  useEditorStore,
} from "~/editor/use-editor-store";

export function LevelFolderTip({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const store = useEditorStore();
  const isPlayMode = useEditorIsPlayMode();
  const folderName = useEditorLevelFolderName();
  const [isFolderLoaded, setIsFolderLoaded] = useState(false);
  const [isDismissed, setIsDismissed] = useLocalStorage<boolean>({
    key: "elma-web-level-folder-tip-dismissed",
    defaultValue: false,
    getInitialValueInEffect: false,
  });

  useEffect(
    function waitForStoredFolder() {
      let isCanceled = false;
      void store
        .getState()
        .levelFolder.ready()
        .then(() => {
          if (!isCanceled) setIsFolderLoaded(true);
        })
        .catch(() => {});
      return function cancelStoredFolderWait() {
        isCanceled = true;
      };
    },
    [store],
  );

  if (
    !isFolderLoaded ||
    isDismissed ||
    isPlayMode ||
    folderName ||
    store.getState().levelFolder.hasFolder() ||
    !supportsFilePickers() ||
    !("showDirectoryPicker" in window)
  ) {
    return null;
  }

  return (
    <div className="text-muted absolute bottom-16 left-4 z-10 flex h-8 items-center rounded-full border border-default bg-screen/80 pr-1.5 text-[11px] font-medium shadow-sm backdrop-blur-[1px] transition-colors hover:bg-screen hover:text-primary sm:bottom-4 sm:text-xs">
      <button
        type="button"
        className="flex h-full cursor-pointer items-center gap-1.5 rounded-full pr-2 pl-2.5 focus-visible:focus-ring"
        aria-haspopup="dialog"
        onClick={onOpenSettings}
      >
        <span className="text-primary">Tip:</span>
        Set your lev folder
      </button>
      <Button
        type="button"
        size="sm"
        iconOnly
        aria-label="Dismiss lev folder tip"
        title="Dismiss tip"
        className="h-6 w-6 rounded-full bg-transparent hover:bg-transparent active:bg-transparent"
        onClick={() => setIsDismissed(true)}
      >
        <XIcon />
      </Button>
    </div>
  );
}
