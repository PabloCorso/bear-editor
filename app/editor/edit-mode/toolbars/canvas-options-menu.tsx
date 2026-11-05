import {
  ArrowsOutIcon,
  ArrowsInIcon,
  CaretDownIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { ToolButton } from "~/components/tool-button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useEditor } from "~/editor/use-editor-store";
import { GridMenu } from "./grid-menu";

export function CanvasOptionsMenu({
  minimapVisible,
  onMinimapVisibleChange,
}: {
  minimapVisible: boolean;
  onMinimapVisibleChange: (visible: boolean) => void;
}) {
  const zoom = useEditor((state) => state.zoom);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenEnabled, setFullscreenEnabled] = useState(false);

  useEffect(() => {
    const sync = () => {
      setFullscreen(document.fullscreenElement !== null);
      setFullscreenEnabled(document.fullscreenEnabled);
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Could not change full screen mode.",
      );
    }
  }

  // The camera scale is CSS pixels per level unit, not a percentage.
  const label = zoom.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    useGrouping: false,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <ToolButton
          name="Canvas options"
          aria-label={`Canvas options, zoom ${label}`}
          className="w-auto min-w-16 gap-1 px-2"
        >
          <span className="font-mono text-xs tabular-nums">{label}</span>
          <CaretDownIcon className="size-3" />
        </ToolButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        collisionPadding={16}
        className="min-w-48"
      >
        <GridMenu />
        <DropdownMenuCheckboxItem
          checked={minimapVisible}
          onCheckedChange={onMinimapVisibleChange}
        >
          Minimap
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          iconBefore={fullscreen ? <ArrowsInIcon /> : <ArrowsOutIcon />}
          disabled={!fullscreenEnabled && !fullscreen}
          onClick={() => void toggleFullscreen()}
        >
          {fullscreen ? "Exit full screen" : "Enter full screen"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
