import { useState } from "react";
import {
  useEditor,
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import { SpriteIcon } from "~/components/sprite-icon";
import { useAppleSprites, useLgrSprite } from "~/components/use-lgr-assets";
import { ToolbarSeparator } from "~/components/ui/toolbar";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import {
  defaultAppleState,
  type AppleToolState,
} from "~/editor/edit-mode/tools/apple-tools";
import { AppleArrowIcon, AppleToolbar } from "./apple-tool-control";
import {
  ToolControlButton,
  ToolControlMenu,
  type ToolControlButtonProps,
} from "./tool";

type ObjectToolId = "apple" | "killer" | "flower";

function isObjectToolId(id: string): id is ObjectToolId {
  return id === "apple" || id === "killer" || id === "flower";
}

export function ObjectToolControl(props: ToolControlButtonProps) {
  const activeToolId = useEditor((state) => state.activeToolId);
  const [lastObjectToolId, setLastObjectToolId] =
    useState<ObjectToolId>("apple");
  // Remember shortcut-driven switches as well as menu clicks, without changing
  // the underlying tools or their individual keyboard shortcuts.
  const currentToolId = isObjectToolId(activeToolId)
    ? activeToolId
    : lastObjectToolId;
  if (currentToolId !== lastObjectToolId) {
    setLastObjectToolId(currentToolId);
  }

  const appleToolState = useEditorToolState<AppleToolState>(
    defaultTools.apple.id,
  );
  const { activateTool, setToolState } = useEditorActions();
  const apple1 = useLgrSprite("qfood1");
  const apple2 = useLgrSprite("qfood2");
  const killer = useLgrSprite("qkiller");
  const flower = useLgrSprite("qexit");
  const appleSprites = useAppleSprites();
  const currentAnimation =
    appleToolState?.animation ?? defaultAppleState.animation;
  const currentGravity = appleToolState?.gravity ?? defaultAppleState.gravity;
  const apple =
    appleSprites.find(
      ({ animation, src }) => animation === currentAnimation && src,
    ) ?? (currentAnimation === 2 ? apple2 : apple1);
  const currentSprite = { apple, killer, flower }[currentToolId];
  const isApple = currentToolId === defaultTools.apple.id;

  const updateApple = (state: Partial<AppleToolState>) => {
    activateTool(defaultTools.apple.id);
    setToolState<AppleToolState>(defaultTools.apple.id, state);
  };

  return (
    <ToolControlMenu
      id={currentToolId}
      button={
        <ToolControlButton
          className="relative"
          isLoading={!currentSprite.src}
          iconAfter={
            isApple ? <AppleArrowIcon gravity={currentGravity} /> : undefined
          }
          {...defaultTools[currentToolId]}
          {...props}
        >
          <SpriteIcon src={currentSprite.src} />
        </ToolControlButton>
      }
    >
      <AppleToolbar
        currentAnimation={isApple ? currentAnimation : null}
        currentGravity={isApple ? currentGravity : null}
        onAnimationChange={(animation) => updateApple({ animation })}
        onGravityChange={(gravity) => updateApple({ gravity })}
      >
        <ToolbarSeparator />
        <ToolControlButton
          {...defaultTools.killer}
          tooltipSide="right"
          size="sm"
          isLoading={!killer.src}
          disabled={props.disabled}
        >
          <SpriteIcon src={killer.src} />
        </ToolControlButton>
        <ToolControlButton
          {...defaultTools.flower}
          tooltipSide="right"
          size="sm"
          isLoading={!flower.src}
          disabled={props.disabled}
        >
          <SpriteIcon src={flower.src} />
        </ToolControlButton>
      </AppleToolbar>
    </ToolControlMenu>
  );
}
