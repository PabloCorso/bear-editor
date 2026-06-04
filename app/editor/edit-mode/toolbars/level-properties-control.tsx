import { useState } from "react";
import { ToolbarButton } from "~/components/ui/toolbar";
import { cn } from "~/utils/misc";
import { useLgrAssets, useTextureSprites } from "~/components/use-lgr-assets";
import { standardSprites } from "~/components/standard-sprites";
import { PictureIcon } from "~/components/sprite-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { IconButton } from "~/components/ui/button";
import { useEditor, useEditorActions } from "~/editor/use-editor-store";
import {
  FloatingToolbar,
  FloatingToolbarAnchor,
  FloatingToolbarContent,
  FloatingToolbarPanel,
  FloatingToolbarTrigger,
} from "./floating-toolbar";
import { LgrSelect } from "~/components/lgr-select";

export function LevelPropertiesControl() {
  const [open, setOpen] = useState(false);
  const { setGround, setLgr, setSky } = useEditorActions();
  const lgrAssets = useLgrAssets();

  const textureSprites = useTextureSprites();
  const allTextures = Array.from(
    new Set(standardSprites.textures.map(({ texture }) => texture)),
  );

  const groundTexture = useEditor((state) => state.ground);
  const levelLgrName = useEditor((state) => state.lgr);
  const skyTexture = useEditor((state) => state.sky);
  const groundTextureSprite = textureSprites.find(
    ({ texture }) => texture.texture === groundTexture,
  );
  const skyTextureSprite = textureSprites.find(
    ({ texture }) => texture.texture === skyTexture,
  );

  const handleSkyTextureSelect = (nextSky: string) => {
    const previousSky = skyTexture;
    const previousGround = groundTexture;
    if (nextSky === previousSky) return;

    if (nextSky === previousGround) {
      setGround(previousSky);
    }
    setSky(nextSky);
  };

  const handleGroundTextureSelect = (nextGround: string) => {
    const previousSky = skyTexture;
    const previousGround = groundTexture;
    if (nextGround === previousGround) return;

    if (nextGround === previousSky) {
      setSky(previousGround);
    }
    setGround(nextGround);
  };

  const skySrc = skyTextureSprite?.maskedSrc ?? skyTextureSprite?.src;
  const groundSrc = groundTextureSprite?.maskedSrc ?? groundTextureSprite?.src;
  const isLoading = !skySrc || !groundSrc;
  return (
    <FloatingToolbar open={open} onOpenChange={setOpen}>
      <FloatingToolbarAnchor>
        <Tooltip>
          <TooltipTrigger>
            <FloatingToolbarTrigger>
              <ToolbarButton
                aria-label="Level properties"
                aria-expanded={open}
                className={cn({ "animate-pulse": isLoading })}
              >
                <LevelTextureIcon skySrc={skySrc} groundSrc={groundSrc} />
              </ToolbarButton>
            </FloatingToolbarTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Level properties
          </TooltipContent>
        </Tooltip>
      </FloatingToolbarAnchor>
      <FloatingToolbarContent side="bottom" align="center">
        <FloatingToolbarPanel
          orientation="vertical"
          className="min-w-max flex-col items-stretch gap-2 pl-4"
        >
          <TexturePickerRow
            label="Sky"
            selectedTexture={skyTexture}
            textures={allTextures}
            textureSprites={textureSprites}
            onSelect={handleSkyTextureSelect}
            tooltipSide="top"
          />
          <TexturePickerRow
            label="Ground"
            selectedTexture={groundTexture}
            textures={allTextures}
            textureSprites={textureSprites}
            onSelect={handleGroundTextureSelect}
          />
          <div className="flex min-w-max items-center justify-between gap-3 border-t border-separator pt-2">
            <div className="w-12 text-xs font-semibold">LGR</div>
            <LgrSelect
              value={levelLgrName}
              onValueChange={setLgr}
              aria-label="Level LGR"
              className="ml-auto h-8 w-fit min-w-0 text-xs"
            />
          </div>
          {lgrAssets.error ? (
            <p className="max-w-64 pl-15 text-xs text-red-300">
              {lgrAssets.error}
            </p>
          ) : null}
        </FloatingToolbarPanel>
      </FloatingToolbarContent>
    </FloatingToolbar>
  );
}

function LevelTextureIcon({
  skySrc,
  groundSrc,
}: {
  skySrc?: string;
  groundSrc?: string;
}) {
  return (
    <span className="relative h-6 w-6 overflow-hidden rounded-sm bg-screen">
      <PictureIcon
        className="absolute inset-0 h-full w-full bg-cover bg-center bg-no-repeat"
        src={skySrc}
        style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
      />
      <PictureIcon
        className="absolute inset-0 h-full w-full bg-cover bg-center bg-no-repeat"
        src={groundSrc}
        style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
      />
    </span>
  );
}

type TexturePickerRowProps = {
  label: string;
  selectedTexture: string;
  textures: string[];
  textureSprites: ReturnType<typeof useTextureSprites>;
  onSelect: (texture: string) => void;
  tooltipSide?: "top" | "bottom";
};

function TexturePickerRow({
  label,
  selectedTexture,
  textures,
  textureSprites,
  onSelect,
  tooltipSide = "bottom",
}: TexturePickerRowProps) {
  return (
    <div className="flex min-w-max items-start gap-3">
      <div className="w-12 self-center text-xs font-semibold">{label}</div>
      <div className="flex flex-nowrap gap-2">
        {textures.map((textureName) => {
          const textureSprite = textureSprites.find(
            ({ texture }) => texture.texture === textureName,
          );
          const selected = selectedTexture === textureName;
          return (
            <Tooltip key={textureName}>
              <TooltipTrigger>
                <IconButton
                  type="button"
                  aria-label={`${label}: ${textureName}`}
                  onClick={() => onSelect(textureName)}
                  className={cn("overflow-clip p-0 hover:opacity-90", {
                    "border border-accent": selected,
                  })}
                >
                  <PictureIcon
                    className="h-full w-full bg-cover bg-center"
                    src={textureSprite?.maskedSrc ?? textureSprite?.src}
                  />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side={tooltipSide} className="text-xs">
                {textureName}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
