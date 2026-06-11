import {
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import { SpriteIcon } from "~/components/sprite-icon";
import {
  ToolControlButton,
  ToolControlMenu,
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
  const appleToolState = useEditorToolState<AppleToolState>(
    defaultTools.apple.id,
  );
  const { setToolState } = useEditorActions();

  const handleAppleAnimationChange = (animation: AppleAnimation) => {
    setToolState<AppleToolState>(defaultTools.apple.id, { animation });
  };

  const handleGravityChange = (gravity: Gravity) => {
    setToolState<AppleToolState>(defaultTools.apple.id, { gravity });
  };

  const apple1 = useLgrSprite("qfood1");
  const apple2 = useLgrSprite("qfood2");
  const appleSprites = useAppleSprites();
  const currentAnimation =
    appleToolState?.animation || defaultAppleState.animation;
  const currentGravity = appleToolState?.gravity ?? defaultAppleState.gravity;
  const fallbackApples: Partial<Record<AppleAnimation, typeof apple1>> = {
    1: apple1,
    2: apple2,
  };
  const apple =
    appleSprites.find(
      ({ animation, src }) => animation === currentAnimation && src,
    ) ??
    (fallbackApples[currentAnimation] || apple1);

  return (
    <ToolControlMenu
      id={defaultTools.apple.id}
      button={
        <ToolControlButton
          className="relative"
          isLoading={!apple.src}
          iconAfter={<AppleArrowIcon gravity={currentGravity} />}
          {...defaultTools.apple}
          {...props}
        >
          <SpriteIcon src={apple.src} />
        </ToolControlButton>
      }
    >
      <AppleToolbar
        onAnimationChange={handleAppleAnimationChange}
        onGravityChange={handleGravityChange}
      />
    </ToolControlMenu>
  );
}

type AppleToolbarProps = ToolbarProps & {
  withShortcuts?: boolean;
  currentAnimation?: AppleAnimation | null;
  currentGravity?: Gravity | null;
  onAnimationChange: (animation: AppleAnimation) => void;
  onGravityChange: (gravity: Gravity) => void;
};

export function AppleToolbar({
  withShortcuts = true,
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
          shortcut={withShortcuts ? String(animation) : undefined}
          isActive={currentAnimation === animation}
          iconBefore={<SpriteIcon src={src} />}
          onClick={() => onAnimationChange(animation)}
        />
      ))}
      <ToolbarSeparator />
      <AppleButton
        shortcut={withShortcuts ? "N" : undefined}
        isActive={currentGravity === Gravity.None}
        iconBefore={<SpriteIcon src={apple.src} />}
        onClick={() => onGravityChange(Gravity.None)}
      />
      <AppleButton
        isActive={currentGravity === Gravity.Down}
        onClick={() => onGravityChange(Gravity.Down)}
        iconBefore={<SpriteIcon src={apple.src} />}
        iconAfter={<AppleArrowIcon gravity={Gravity.Down} />}
      />
      <AppleButton
        isActive={currentGravity === Gravity.Left}
        onClick={() => onGravityChange(Gravity.Left)}
        iconBefore={<SpriteIcon src={apple.src} />}
        iconAfter={<AppleArrowIcon gravity={Gravity.Left} />}
      />
      <AppleButton
        isActive={currentGravity === Gravity.Up}
        onClick={() => onGravityChange(Gravity.Up)}
        iconBefore={<SpriteIcon src={apple.src} />}
        iconAfter={<AppleArrowIcon gravity={Gravity.Up} />}
      />
      <AppleButton
        isActive={currentGravity === Gravity.Right}
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
  return (
    <ToolbarButton
      size="sm"
      className={cn("relative", isActive && "bg-primary-hover/50", className)}
      iconAfter={shortcut && <ShortcutIndicator>{shortcut}</ShortcutIndicator>}
      {...props}
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
