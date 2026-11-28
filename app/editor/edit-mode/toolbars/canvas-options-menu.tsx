import {
  ArrowsOutIcon,
  ArrowsInIcon,
  CaretDownIcon,
  CornersOutIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { Icon } from "~/components/ui/icon";
import { ToolbarButton } from "~/components/ui/toolbar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useEditor, useEditorActions } from "~/editor/use-editor-store";
import { GridMenuGroup } from "./grid-menu";
import { FIT_TO_VIEW_SHORTCUT } from "./keyboard-shortcuts";

export function CanvasOptionsMenu() {
  const { triggerFitToView, toggleSmartGuides } = useEditorActions();
  const showSmartGuides = useEditor((state) => state.showSmartGuides);
  const snapToSmartGuides = useEditor((state) => state.snapToSmartGuides);
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

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger>
          <DropdownMenuTrigger>
            <ToolbarButton
              aria-label="Canvas options"
              className="gap-1 p-2"
              iconOnly={false}
              iconBefore={<CornersOutIcon />}
              iconAfter={
                <Icon size="xs">
                  <CaretDownIcon />
                </Icon>
              }
            />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Canvas options</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side="top"
        align="end"
        collisionPadding={16}
        className="min-w-48"
      >
        <GridMenuGroup />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Smart guides</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={showSmartGuides}
            onCheckedChange={() => toggleSmartGuides("showSmartGuides")}
          >
            Show smart guides
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={snapToSmartGuides}
            onCheckedChange={() => toggleSmartGuides("snapToSmartGuides")}
          >
            Snap to smart guides
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        {(fullscreenEnabled || fullscreen) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              iconBefore={fullscreen ? <ArrowsInIcon /> : <ArrowsOutIcon />}
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? "Exit full screen" : "Enter full screen"}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          iconBefore={<CornersOutIcon />}
          shortcut={FIT_TO_VIEW_SHORTCUT}
          aria-keyshortcuts={FIT_TO_VIEW_SHORTCUT}
          onClick={triggerFitToView}
        >
          Fit to view
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
