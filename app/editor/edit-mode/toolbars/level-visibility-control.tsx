import {
  isDefaultLevelVisibility,
  type LevelVisibilitySettings,
} from "~/editor/level-visibility";
import { useEditor, useEditorActions } from "~/editor/use-editor-store";
import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CheckIcon,
} from "@phosphor-icons/react/dist/ssr";
import { SpriteIcon } from "~/components/sprite-icon";
import {
  useLgrSprite,
  useLgrAssets,
  usePictureSprites,
  useTextureSprites,
} from "~/components/use-lgr-assets";
import { ToolbarButton } from "~/components/ui/toolbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { Icon } from "~/components/ui/icon";
import { cn } from "~/utils/misc";
import { colors, OBJECT_FRAME_PX } from "~/editor/constants";
import { VertexIcon } from "./vertex-tool-control";

const HEADER_DROPDOWN_COLLISION_PADDING = 16;

export function LevelVisibilityControl() {
  const levelVisibility = useEditor((state) => state.levelVisibility);
  const { toggleLevelVisibility, resetLevelVisibility } = useEditorActions();

  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger>
          <DropdownMenuTrigger>
            <ToolbarButton
              aria-label="Visibility options"
              className="gap-1 p-2"
              iconOnly={false}
              iconBefore={<GroundSkyTexturesIcon />}
              iconAfter={
                <Icon size="xs">
                  <CaretDownIcon />
                </Icon>
              }
            />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Visibility options
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        className="min-w-56"
        side="bottom"
        align="start"
        collisionPadding={HEADER_DROPDOWN_COLLISION_PADDING}
      >
        <LevelVisibilityControls
          levelVisibility={levelVisibility}
          onToggle={toggleLevelVisibility}
          onReset={resetLevelVisibility}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LevelVisibilityControls({
  levelVisibility,
  onToggle,
  onReset,
}: {
  levelVisibility: LevelVisibilitySettings;
  onToggle: (key: keyof LevelVisibilitySettings) => void;
  onReset?: () => void;
}) {
  const canReset = !isDefaultLevelVisibility(levelVisibility);
  return (
    <>
      <DropdownMenuGroup>
        <VisibilityToggleButton
          label="Ground/Sky textures"
          icon={<GroundSkyTexturesIcon />}
          active={levelVisibility.useGroundSkyTextures}
          onClick={() => onToggle("useGroundSkyTextures")}
        />
        <VisibilityToggleButton
          label="Grass textures"
          icon={<GrassTexturesIcon />}
          active={levelVisibility.useGrassTextures}
          onClick={() => onToggle("useGrassTextures")}
        />
        <VisibilityToggleButton
          label="Zoom textures"
          icon={<BrickTextureIcon className="h-5 w-5" />}
          active={levelVisibility.zoomTextures}
          onClick={() => onToggle("zoomTextures")}
        />
        <VisibilityToggleButton
          label="Polygon handles"
          icon={<PolygonHandlesIcon />}
          active={levelVisibility.showPolygonHandles}
          onClick={() => onToggle("showPolygonHandles")}
        />
        <VisibilityToggleButton
          label="Object animations"
          icon={<ObjectAnimationsIcon />}
          active={levelVisibility.showObjectAnimations}
          onClick={() => onToggle("showObjectAnimations")}
        />
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <VisibilityToggleButton
          label="Objects"
          icon={<ObjectsIcon />}
          active={levelVisibility.showObjects}
          onClick={() => onToggle("showObjects")}
        />
        <VisibilityToggleButton
          label="Pictures"
          icon={<PicturesIcon />}
          active={levelVisibility.showPictures}
          onClick={() => onToggle("showPictures")}
        />
        <VisibilityToggleButton
          label="Textures"
          icon={<BrickTextureIcon className="h-5 w-5" />}
          active={levelVisibility.showTextures}
          onClick={() => onToggle("showTextures")}
        />
        <VisibilityToggleButton
          label="Polygons"
          icon={<PolygonsIcon />}
          active={levelVisibility.showPolygons}
          onClick={() => onToggle("showPolygons")}
        />
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <VisibilityToggleButton
          label="Object bounds"
          icon={<ObjectBoundsIcon />}
          active={levelVisibility.showObjectBounds}
          onClick={() => onToggle("showObjectBounds")}
        />
        <VisibilityToggleButton
          label="Picture bounds"
          icon={<PictureBoundsIcon />}
          active={levelVisibility.showPictureBounds}
          onClick={() => onToggle("showPictureBounds")}
        />
        <VisibilityToggleButton
          label="Texture bounds"
          icon={<TextureBoundsIcon />}
          active={levelVisibility.showTextureBounds}
          onClick={() => onToggle("showTextureBounds")}
        />
        <VisibilityToggleButton
          label="Ground bounds"
          icon={<GroundBoundsIcon />}
          active={levelVisibility.showGroundBounds}
          onClick={() => onToggle("showGroundBounds")}
        />
        <VisibilityToggleButton
          label="Grass bounds"
          icon={<GrassBoundsIcon />}
          active={levelVisibility.showGrassBounds}
          onClick={() => onToggle("showGrassBounds")}
        />
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          iconBefore={<ArrowsClockwiseIcon />}
          onClick={onReset}
          closeOnClick={false}
          disabled={!canReset}
        >
          Reset defaults
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  );
}

function VisibilityToggleButton({
  label,
  icon,
  active,
  className,
  onClick,
  ...props
}: Omit<React.ComponentProps<typeof DropdownMenuItem>, "children"> & {
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <DropdownMenuItem
      iconBefore={icon}
      iconAfter={active ? <CheckIcon /> : undefined}
      aria-pressed={active}
      closeOnClick={false}
      className={cn("font-medium", className)}
      onClick={onClick}
      {...props}
    >
      {label}
    </DropdownMenuItem>
  );
}

function GroundSkyTexturesIcon({
  className,
  ...props
}: React.ComponentPropsWithRef<"span">) {
  const ground = useLgrSprite("ground");
  const sky = useLgrSprite("sky");

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-block h-full w-full overflow-hidden rounded-[4px]",
        className,
      )}
      {...props}
    >
      <span
        className="absolute inset-0 bg-repeat"
        style={{
          backgroundImage: ground.src ? `url(${ground.src})` : undefined,
          backgroundSize: "8px 8px",
        }}
      />
      <span
        className="absolute inset-0"
        style={{
          backgroundImage: sky.src ? `url(${sky.src})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          clipPath: "polygon(0 0, 100% 0, 0 100%)",
        }}
      />
    </span>
  );
}

function PolygonHandlesIcon(props: React.SVGProps<SVGSVGElement>) {
  return <VertexIcon handles {...props} />;
}

function GrassTexturesIcon({
  className,
  ...props
}: React.ComponentPropsWithRef<"span">) {
  const { lgr } = useLgrAssets();
  const grass = lgr?.getSpritePreview("qgrass");

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-block h-full w-full overflow-hidden rounded-[4px] bg-[#00ff00]",
        className,
      )}
      style={{
        backgroundImage: grass ? `url(${grass})` : undefined,
        backgroundRepeat: "repeat",
        backgroundSize: "8px 8px",
      }}
      {...props}
    />
  );
}

function ObjectAnimationsIcon({
  className,
  ...props
}: React.ComponentPropsWithRef<"span">) {
  const apple = useLgrSprite("qfood1");

  return (
    <span aria-hidden="true" className={cn("relative", className)} {...props}>
      <span
        className="absolute inset-0 bg-no-repeat"
        style={{
          backgroundImage: apple.src ? `url(${apple.src})` : undefined,
          backgroundSize: "auto 100%",
          backgroundPosition: `calc(50% - ${OBJECT_FRAME_PX / 2}px) center`,
        }}
      />
    </span>
  );
}

function ObjectsIcon({
  className,
  ...props
}: React.ComponentPropsWithRef<"span">) {
  const apple = useLgrSprite("qfood1");
  const killer = useLgrSprite("qkiller");
  const flower = useLgrSprite("qexit");

  return (
    <span className={cn("relative", className)} {...props}>
      <SpriteIcon
        src={apple.src}
        className="absolute top-0 left-1/2 h-1/2 w-1/2 -translate-x-1/2"
      />
      <SpriteIcon
        src={killer.src}
        className="absolute bottom-0 left-0 h-1/2 w-1/2"
      />
      <SpriteIcon
        src={flower.src}
        className="absolute right-0 bottom-0 h-1/2 w-1/2"
      />
    </span>
  );
}

function PicturesIcon({
  className,
  ...props
}: React.ComponentPropsWithRef<"span">) {
  const pictureSprites = usePictureSprites();
  const barrel = pictureSprites.find(
    ({ picture }) => picture.name === "barrel",
  );
  const fallbackPicture = pictureSprites.find(({ src }) => Boolean(src));
  const src = barrel?.src ?? fallbackPicture?.src;

  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      {...props}
    >
      <SpriteIcon
        src={src}
        className="block h-full w-full bg-contain bg-center bg-no-repeat"
      />
    </span>
  );
}

function BrickTextureIcon({
  className,
  ...props
}: React.ComponentPropsWithRef<"span">) {
  const textureSprites = useTextureSprites();
  const brickTexture = textureSprites.find(
    ({ texture }) => texture.texture === "brick",
  );
  const fallbackTexture = textureSprites.find(({ src }) => Boolean(src));
  const fallbackSprite = useLgrSprite("brick");
  const src = brickTexture?.src ?? fallbackTexture?.src ?? fallbackSprite.src;

  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      {...props}
    >
      <SpriteIcon
        src={src}
        className="block h-full w-full bg-contain bg-center bg-no-repeat"
      />
    </span>
  );
}

function PolygonsIcon(props: React.SVGProps<SVGSVGElement>) {
  return <VertexIcon {...props} />;
}

function ObjectBoundsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle
        cx="12"
        cy="7"
        r="3.2"
        stroke={colors.selection}
        strokeWidth="2"
      />
      <circle
        cx="7.2"
        cy="16.2"
        r="3.2"
        stroke={colors.selection}
        strokeWidth="2"
      />
      <circle
        cx="16.8"
        cy="16.2"
        r="3.2"
        stroke={colors.selection}
        strokeWidth="2"
      />
    </svg>
  );
}

function PictureBoundsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        stroke={colors.selection}
        strokeWidth="2"
      />
    </svg>
  );
}

function TextureBoundsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect
        x="6"
        y="2"
        width="14"
        height="20"
        stroke={colors.selection}
        strokeWidth="2"
      />
    </svg>
  );
}

function GroundBoundsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <VertexIcon sky="transparent" ground="transparent" bounds {...props} />
  );
}

function GrassBoundsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <VertexIcon
      sky="transparent"
      ground="transparent"
      bounds
      boundsColor={colors.grass}
      {...props}
    />
  );
}
