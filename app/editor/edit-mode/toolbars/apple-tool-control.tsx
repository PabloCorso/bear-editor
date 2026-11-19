import {
  useEditorActions,
  useEditor,
  useEditorToolState,
} from "~/editor/use-editor-store";
import { SpriteIcon } from "~/components/sprite-icon";
import {
  ToolControlButton,
  ToolControlMenu,
  useToolSelection,
  type ToolControlButtonProps,
} from "./tool";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import { useAppleSprites, useLgrSprite } from "~/components/use-lgr-assets";
import {
  defaultAppleState,
  type AppleToolState,
} from "~/editor/edit-mode/tools/apple-tools";
import { type AppleAnimation, Gravity } from "~/editor/elma-types";
import { cn } from "~/utils/misc";
import { type ButtonProps } from "~/components/ui/button";
import {
  Toolbar,
  ToolbarButton,
  ToolbarSeparator,
  type ToolbarProps,
} from "~/components/ui/toolbar";

export function AppleToolControl(props: ToolControlButtonProps) {
  const { setToolState, activateTool } = useEditorActions();
  const activeToolId = useEditor((state) => state.activeToolId);
  const killer = useLgrSprite("qkiller");
  const flower = useLgrSprite("qexit");

  const handleAppleAnimationChange = (animation: AppleAnimation) => {
    if (activeToolId !== "apple") activateTool("apple");
    setToolState<AppleToolState>(defaultTools.apple.id, { animation });
  };

  const handleGravityChange = (gravity: Gravity) => {
    if (activeToolId !== "apple") activateTool("apple");
    setToolState<AppleToolState>(defaultTools.apple.id, { gravity });
  };

  const apple = useLgrSprite("qfood1");

  return (
    <ToolControlMenu
      id={defaultTools.apple.id}
      closeOnSelect={false}
      button={
        <ToolControlButton
          isActive={["apple", "killer", "flower"].includes(activeToolId)}
          isLoading={!apple.src}
          {...defaultTools.apple}
          id={
            ["apple", "killer", "flower"].includes(activeToolId)
              ? activeToolId
              : "apple"
          }
          name="Objects"
          shortcut="A / K / F"
          {...props}
        >
          <SpriteIcon src={apple.src} />
        </ToolControlButton>
      }
    >
      <Toolbar orientation="vertical" aria-label="Objects">
        <AppleToolbar
          className="border-0 bg-transparent p-0 shadow-none"
          isSelected={activeToolId === "apple"}
          onAnimationChange={handleAppleAnimationChange}
          onGravityChange={handleGravityChange}
        />
        <ToolbarSeparator />
        <ToolControlButton {...defaultTools.killer} isLoading={!killer.src}>
          <SpriteIcon src={killer.src} />
        </ToolControlButton>
        <ToolbarSeparator />
        <ToolControlButton {...defaultTools.flower} isLoading={!flower.src}>
          <SpriteIcon src={flower.src} />
        </ToolControlButton>
      </Toolbar>
    </ToolControlMenu>
  );
}

type AppleToolbarProps = ToolbarProps & {
  withShortcuts?: boolean;
  isSelected?: boolean;
  currentAnimation?: AppleAnimation | null;
  currentGravity?: Gravity | null;
  onAnimationChange: (animation: AppleAnimation) => void;
  onGravityChange: (gravity: Gravity) => void;
};

export function AppleToolbar({
  withShortcuts = true,
  isSelected = true,
  currentAnimation: controlledAnimation,
  currentGravity: controlledGravity,
  onAnimationChange,
  onGravityChange,
  ...props
}: AppleToolbarProps) {
  const appleToolState = useEditorToolState<AppleToolState>(
    defaultTools.apple.id,
  );
  const appleSprites = useAppleSprites();
  const apple = useLgrSprite("qfood1");
  const currentAnimation =
    controlledAnimation === undefined
      ? (appleToolState?.animation ?? defaultAppleState.animation)
      : controlledAnimation;
  const currentGravity =
    controlledGravity === undefined
      ? (appleToolState?.gravity ?? defaultAppleState.gravity)
      : controlledGravity;

  return (
    <Toolbar orientation="vertical" {...props}>
      {appleSprites.map(({ animation, src }) => (
        <AppleButton
          key={animation}
          aria-label={`Apple animation ${animation}`}
          shortcut={withShortcuts ? String(animation) : undefined}
          isActive={isSelected && currentAnimation === animation}
          iconBefore={<SpriteIcon src={src} />}
          onClick={() => onAnimationChange(animation)}
        />
      ))}
      <ToolbarSeparator />
      <AppleButton
        shortcut={withShortcuts ? "N" : undefined}
        aria-label="No gravity"
        isActive={isSelected && currentGravity === Gravity.None}
        iconBefore={<SpriteIcon src={apple.src} />}
        onClick={() => onGravityChange(Gravity.None)}
      />
      <AppleButton
        aria-label="Gravity down"
        isActive={isSelected && currentGravity === Gravity.Down}
        onClick={() => onGravityChange(Gravity.Down)}
        iconBefore={<SpriteIcon src={apple.src} />}
        iconAfter={<AppleArrowIcon gravity={Gravity.Down} />}
      />
      <AppleButton
        aria-label="Gravity left"
        isActive={isSelected && currentGravity === Gravity.Left}
        onClick={() => onGravityChange(Gravity.Left)}
        iconBefore={<SpriteIcon src={apple.src} />}
        iconAfter={<AppleArrowIcon gravity={Gravity.Left} />}
      />
      <AppleButton
        aria-label="Gravity up"
        isActive={isSelected && currentGravity === Gravity.Up}
        onClick={() => onGravityChange(Gravity.Up)}
        iconBefore={<SpriteIcon src={apple.src} />}
        iconAfter={<AppleArrowIcon gravity={Gravity.Up} />}
      />
      <AppleButton
        aria-label="Gravity right"
        isActive={isSelected && currentGravity === Gravity.Right}
        onClick={() => onGravityChange(Gravity.Right)}
        iconBefore={<SpriteIcon src={apple.src} />}
        iconAfter={<AppleArrowIcon gravity={Gravity.Right} />}
      />
    </Toolbar>
  );
}

const gravityRotations: Record<Gravity, number> = {
  [Gravity.None]: 0,
  [Gravity.Up]: 0,
  [Gravity.Down]: 180,
  [Gravity.Left]: -90,
  [Gravity.Right]: 90,
} as const;

function GravityIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 256 256" fill="none" {...props}>
      <polyline
        points="80 140 128 100 176 140"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="32"
      />
    </svg>
  );
}

function AppleButton({
  className,
  shortcut,
  isActive,
  ...props
}: ButtonProps & { shortcut?: string; isActive?: boolean }) {
  const onSelect = useToolSelection();
  return (
    <ToolbarButton
      size="sm"
      aria-pressed={isActive}
      className={cn("relative", isActive && "bg-primary-hover/50", className)}
      iconAfter={shortcut && <ShortcutIndicator>{shortcut}</ShortcutIndicator>}
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        onSelect?.();
      }}
    />
  );
}

export function AppleArrowIcon({
  gravity,
  className,
  style,
  ...props
}: { gravity: Gravity } & React.SVGProps<SVGSVGElement>) {
  if (gravity === Gravity.None) return null;
  const rotation = gravityRotations[gravity];
  return (
    <GravityIcon
      className={cn("absolute inset-0 m-auto text-[#fde047]", className)}
      style={{ transform: `rotate(${rotation}deg)`, ...style }}
      {...props}
    />
  );
}

function ShortcutIndicator({
  className,
  ...props
}: React.ComponentPropsWithRef<"span">) {
  return (
    <span
      className={cn(
        "bg-background/80 absolute right-1 bottom-1 max-h-2 max-w-2 rounded-sm px-0.5 text-[8px] leading-none font-medium text-white/75 select-none",
        className,
      )}
      {...props}
    />
  );
}
