import { HandIcon, SparkleIcon } from "@phosphor-icons/react/dist/ssr";
import { SpriteIcon } from "~/components/sprite-icon";
import { ToolControlButton, type ToolControlButtonProps } from "./tool";
import {
  defaultToolOrder,
  defaultTools,
  type ToolMeta,
} from "~/editor/edit-mode/tools/default-tools";
import {
  Toolbar,
  ToolbarSeparator,
  type ToolbarProps,
} from "~/components/ui/toolbar";
import { useLgrSprite } from "~/components/use-lgr-assets";
import { AppleToolControl } from "./apple-tool-control";
import { PictureToolControl } from "./picture-tool-control";
import { TextureToolControl } from "./texture-tool-control";
import { VertexToolControl } from "./vertex-tool-control";
import { cn } from "~/utils/misc";
import { SelectToolControl } from "./select-tool-control";
import { useEditorRegisteredTools } from "~/editor/use-editor-store";

type ControlToolbarProps = ToolbarProps & {
  isOpenAIEnabled?: boolean;
};

export function ControlToolbar({
  className,
  isOpenAIEnabled,
  ...props
}: ControlToolbarProps) {
  const toolMetas = useEditorRegisteredTools();
  const orderedTools = sortToolMetas(toolMetas);
  const navigationToolIds = new Set<string>([
    defaultTools.select.id,
    defaultTools.hand.id,
  ]);
  const navigationTools = orderedTools.filter((tool) =>
    navigationToolIds.has(tool.id),
  );
  const drawingTools = orderedTools.filter(
    (tool) => !navigationTools.some((navigationTool) => navigationTool.id === tool.id),
  );

  return (
    <div
      className={cn("absolute inset-y-0 left-4 grid", className)}
      style={{
        gridTemplateRows:
          "minmax(var(--toolbar-space), 1fr) auto minmax(1rem, 1fr)",
      }}
    >
      <Toolbar
        orientation="vertical"
        className="row-start-2 flex h-fit max-h-full flex-col gap-2 self-center overflow-auto"
        {...props}
      >
        {navigationTools.map((tool) => (
          <RegisteredToolControl
            key={tool.id}
            meta={tool}
            tooltipSide="right"
          />
        ))}

        {drawingTools.length > 0 && <ToolbarSeparator />}

        {drawingTools.map((tool) => (
          <RegisteredToolControl
            key={tool.id}
            meta={tool}
            tooltipSide="right"
          />
        ))}
        {isOpenAIEnabled && <AIChatToolControl tooltipSide="right" />}
      </Toolbar>
    </div>
  );
}

function RegisteredToolControl({
  meta,
  ...props
}: ToolControlButtonProps & { meta: ToolMeta }) {
  if (meta.id === defaultTools.select.id) {
    return <SelectToolControl {...props} />;
  }
  if (meta.id === defaultTools.hand.id) {
    return <HandToolControl {...props} />;
  }
  if (meta.id === defaultTools.vertex.id) {
    return <VertexToolControl {...props} />;
  }
  if (meta.id === defaultTools.apple.id) {
    return <AppleToolControl {...props} />;
  }
  if (meta.id === defaultTools.killer.id) {
    return <KillerToolControl {...props} />;
  }
  if (meta.id === defaultTools.flower.id) {
    return <FlowerToolControl {...props} />;
  }
  if (meta.id === defaultTools.picture.id) {
    return <PictureToolControl {...props} />;
  }
  if (meta.id === defaultTools.texture.id) {
    return <TextureToolControl {...props} />;
  }

  return (
    <ToolControlButton id={meta.id} name={meta.name} shortcut={meta.shortcut} {...props}>
      <GenericToolGlyph label={meta.name} />
    </ToolControlButton>
  );
}

function HandToolControl(props: ToolControlButtonProps) {
  return (
    <ToolControlButton {...defaultTools.hand} {...props}>
      <HandIcon weight="light" />
    </ToolControlButton>
  );
}

function KillerToolControl(props: ToolControlButtonProps) {
  const killerSprite = useLgrSprite("qkiller");
  return (
    <ToolControlButton
      isLoading={!killerSprite.src}
      {...defaultTools.killer}
      {...props}
    >
      <SpriteIcon src={killerSprite.src} />
    </ToolControlButton>
  );
}

function FlowerToolControl(props: ToolControlButtonProps) {
  const flowerSprite = useLgrSprite("qexit");
  return (
    <ToolControlButton
      isLoading={!flowerSprite.src}
      {...defaultTools.flower}
      {...props}
    >
      <SpriteIcon src={flowerSprite.src} />
    </ToolControlButton>
  );
}

function AIChatToolControl(props: ToolControlButtonProps) {
  return (
    <ToolControlButton id="ai-chat" name="AI Assistant" shortcut="I" {...props}>
      <SparkleIcon weight="fill" />
    </ToolControlButton>
  );
}

function GenericToolGlyph({ label }: { label: string }) {
  const letters = label
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span className="inline-flex h-4 w-4 items-center justify-center text-[10px] font-semibold">
      {letters || "?"}
    </span>
  );
}

function sortToolMetas(toolMetas: ToolMeta[]) {
  const orderMap = new Map(defaultToolOrder.map((id, index) => [id, index]));

  return [...toolMetas].sort((left, right) => {
    const leftIndex = orderMap.get(left.id);
    const rightIndex = orderMap.get(right.id);

    if (leftIndex != null && rightIndex != null) {
      return leftIndex - rightIndex;
    }
    if (leftIndex != null) return -1;
    if (rightIndex != null) return 1;

    return left.name.localeCompare(right.name);
  });
}
