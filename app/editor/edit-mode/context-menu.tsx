import {
  useEditorToolState,
  useEditorActions,
  useEditorActiveTool,
} from "~/editor/use-editor-store";
import {
  SelectTool,
  type ArrangeSelectionDirection,
  type SelectSelectionKind,
  type SelectToolState,
} from "~/editor/edit-mode/tools/select-tool";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import {
  AppleArrowIcon,
  AppleToolbar,
} from "~/editor/edit-mode/toolbars/apple-tool-control";
import { PicturePropertiesToolbar } from "~/editor/edit-mode/toolbars/picture-properties-toolbar";
import {
  VertexContextMenuToolbar,
  VertexIcon,
  getVertexIconProps,
} from "~/editor/edit-mode/toolbars/vertex-tool-control";
import { useEditor } from "~/editor/use-editor-store";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Gravity,
  Mask,
  type Apple,
  type AppleAnimation,
  type Picture,
  type Position,
} from "~/editor/elma-types";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Icon } from "~/components/ui/icon";
import { PictureIcon, SpriteIcon } from "~/components/sprite-icon";
import {
  useAppleSprites,
  useLgrSprite,
  useTextureMaskSprites,
} from "~/components/use-lgr-assets";
import { defaultAppleState } from "~/editor/edit-mode/tools/apple-tools";
import { defaultPictureState } from "~/editor/edit-mode/tools/picture-tool";
import { defaultTextureState } from "~/editor/edit-mode/tools/texture-tool";
import { colors } from "~/editor/constants";
import {
  Toolbar,
  ToolbarButton,
  ToolbarSeparator,
} from "~/components/ui/toolbar";
import {
  CaretDownIcon,
  DotsThreeVerticalIcon,
  ArrowRightIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn, useModifier } from "~/utils/misc";
import kuskiSrc from "~/assets/kuski.png";

const TOOLBAR_COLLISION_PADDING_PX = 8;

type PointAnchor = {
  getBoundingClientRect: () => DOMRect;
};

export function EditorContextMenu() {
  const { setApples, setPictures, setPolygons } = useEditorActions();
  const selectToolState = useEditorToolState<SelectToolState>(
    defaultTools.select.id,
  );
  const selectTool = useEditorActiveTool<SelectTool>();
  const apples = useEditor((state) => state.apples);
  const killers = useEditor((state) => state.killers);
  const flowers = useEditor((state) => state.flowers);
  const start = useEditor((state) => state.start);
  const polygons = useEditor((state) => state.polygons);
  const pictures = useEditor((state) => state.pictures);
  const [selectionFilterSource, setSelectionFilterSource] = useState<{
    key: string;
    selection: SelectionFilterSource;
  } | null>(null);

  const contextMenuType = selectToolState?.contextMenuType;
  if (!contextMenuType && selectionFilterSource) {
    setSelectionFilterSource(null);
  }
  if (!contextMenuType) return null;

  const selectionFilterKey = getSelectionFilterKey(selectToolState);
  const nextSelectionFilterSource =
    selectionFilterSource?.key === selectionFilterKey
      ? selectionFilterSource.selection
      : captureSelectionFilterSource(selectToolState);

  if (selectionFilterSource?.key !== selectionFilterKey) {
    setSelectionFilterSource({
      key: selectionFilterKey,
      selection: nextSelectionFilterSource,
    });
  }

  const selectedApples = getSelectedApples(
    selectToolState.selectedObjects,
    apples,
  );
  const commonAppleAnimation = getCommonAppleAnimation(selectedApples);
  const commonAppleGravity = getCommonAppleGravity(selectedApples);
  const selectedPolygons = getSelectedPolygons(selectToolState);
  const canToggleGrass = selectedPolygons.length > 0;
  const selectedPictures = getSelectedPictures(selectToolState, pictures);
  const hasSelection =
    selectToolState.selectedVertices.length > 0 ||
    selectToolState.selectedObjects.length > 0 ||
    selectToolState.selectedPictures.length > 0;
  const canDuplicate = selectTool?.canDuplicateSelection() ?? false;
  const selectionGroups = getSelectionGroups(selectToolState, {
    apples,
    killers,
    flowers,
    start,
    pictures,
  });
  const sourceSelectionGroups = getSelectionGroups(nextSelectionFilterSource, {
    apples,
    killers,
    flowers,
    start,
    pictures,
  });
  const selectionCount = selectionGroups.reduce(
    (total, group) => total + group.count,
    0,
  );
  const sourceSelectionCount = sourceSelectionGroups.reduce(
    (total, group) => total + group.count,
    0,
  );
  const activeSelectionKinds = new Set(
    selectionGroups.map((group) => group.kind),
  );
  const showSelectionSummary = sourceSelectionCount > 1;
  const canArrange = selectTool?.canArrangeSelection() ?? false;
  const toolbarSections: React.ReactNode[] = [];

  if (showSelectionSummary) {
    toolbarSections.push(
      <SelectionGroupsMenu
        activeKinds={activeSelectionKinds}
        currentCount={selectionCount}
        onSelect={(kind) => {
          selectTool?.selectOnlySelectionKind(kind);
        }}
        onToggle={(kind) => {
          const nextKinds = new Set(activeSelectionKinds);
          if (nextKinds.has(kind)) {
            if (nextKinds.size === 1) return;
            nextKinds.delete(kind);
          } else {
            nextKinds.add(kind);
          }
          selectTool?.selectSelectionKinds(
            nextKinds,
            nextSelectionFilterSource,
            { closeContextMenu: false },
          );
        }}
        sourceGroups={sourceSelectionGroups}
      />,
    );
  }

  if (selectedApples.length > 0) {
    toolbarSections.push(
      <SelectedApplesMenu
        selectedApples={selectedApples}
        currentAnimation={commonAppleAnimation}
        currentGravity={commonAppleGravity}
        onAnimationChange={(animation) => {
          setApples(
            updateSelectedApples(apples, selectedApples, { animation }),
          );
        }}
        onGravityChange={(gravity) => {
          setApples(updateSelectedApples(apples, selectedApples, { gravity }));
        }}
      />,
    );
  }

  if (canToggleGrass) {
    toolbarSections.push(
      <VertexContextMenuToolbar
        role="group"
        tabIndex={-1}
        orientation="horizontal"
        className="border-0 bg-transparent p-0 shadow-none"
        onGrassToggle={() => {
          const selectedPolygonSet = new Set(selectedPolygons);
          setPolygons(
            polygons.map((polygon) =>
              selectedPolygonSet.has(polygon)
                ? { ...polygon, grass: !polygon.grass }
                : polygon,
            ),
          );
        }}
      />,
    );
  }

  if (selectedPictures.length > 0) {
    const commonPictureDistance = getCommonPictureDistance(selectedPictures);
    const commonPictureClip = getCommonPictureClip(selectedPictures);
    const selectedPicturePositions = new Set(
      selectedPictures.map((picture) => picture.position),
    );

    toolbarSections.push(
      <PicturePropertiesToolbar
        role="group"
        tabIndex={-1}
        orientation="horizontal"
        variant="summary-popover"
        className="!h-10 w-fit border-0 bg-transparent px-2 shadow-none"
        distance={commonPictureDistance}
        clip={commonPictureClip}
        onDistanceChange={(distance) => {
          setPictures(
            pictures.map((picture) =>
              selectedPicturePositions.has(picture.position)
                ? { ...picture, distance }
                : picture,
            ),
          );
        }}
        onClipChange={(clip) => {
          setPictures(
            pictures.map((picture) =>
              selectedPicturePositions.has(picture.position)
                ? { ...picture, clip }
                : picture,
            ),
          );
        }}
      />,
    );
  }

  toolbarSections.push(
    <SelectionActionsMenu
      canArrange={canArrange}
      canDuplicate={canDuplicate}
      onArrange={(direction) => {
        selectTool?.arrangeSelectedPictures(direction);
      }}
      onCopy={() => {
        selectTool?.copyCurrentSelection();
        selectTool?.closeContextMenu();
      }}
      onDuplicate={() => {
        selectTool?.duplicateSelectionWithOffset();
        selectTool?.closeContextMenu();
      }}
      onDelete={() => {
        selectTool?.deleteCurrentSelection();
        selectTool?.closeContextMenu();
      }}
    />,
  );

  if (!hasSelection) return null;

  const canvas =
    typeof document === "undefined" ? null : document.querySelector("canvas");
  const collisionBoundary = canvas ?? undefined;

  const anchorPosition = getContextMenuAnchorPosition(
    selectToolState.contextMenuPosition ?? { x: 0, y: 0 },
  );

  const anchor = createRectAnchor(anchorPosition, canvas, {
    width: 0,
    height: 0,
  });

  return (
    <Popover
      open={Boolean(contextMenuType)}
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          selectTool?.closeContextMenu();
        }
      }}
    >
      <PopoverContent
        anchor={anchor}
        positionMethod="fixed"
        initialFocus={false}
        finalFocus={false}
        side="top"
        align="start"
        collisionBoundary={collisionBoundary}
        collisionPadding={TOOLBAR_COLLISION_PADDING_PX}
        collisionAvoidance={{
          side: "flip",
          align: "shift",
          fallbackAxisSide: "none",
        }}
        className="z-50 outline-hidden"
      >
        <Toolbar
          tabIndex={-1}
          orientation="horizontal"
          className="max-w-[calc(100vw-1rem)] overflow-auto"
        >
          {toolbarSections.map((section, index) => (
            <ToolbarSection key={index} separated={index > 0}>
              {section}
            </ToolbarSection>
          ))}
        </Toolbar>
      </PopoverContent>
    </Popover>
  );
}

function ToolbarSection({
  children,
  separated,
}: {
  children: React.ReactNode;
  separated: boolean;
}) {
  return (
    <>
      {separated ? <ToolbarSeparator /> : null}
      {children}
    </>
  );
}

type SelectionGroup = {
  kind: SelectSelectionKind;
  label: string;
  singularLabel: string;
  count: number;
};

type SelectionFilterSource = Pick<
  SelectToolState,
  "selectedVertices" | "selectedObjects" | "selectedPictures"
>;

function SelectionGroupsMenu({
  activeKinds,
  currentCount,
  onSelect,
  onToggle,
  sourceGroups,
}: {
  activeKinds: ReadonlySet<SelectSelectionKind>;
  currentCount: number;
  onSelect: (kind: SelectSelectionKind) => void;
  onToggle: (kind: SelectSelectionKind) => void;
  sourceGroups: SelectionGroup[];
}) {
  const totalCount = sourceGroups.reduce(
    (total, group) => total + group.count,
    0,
  );
  const icons = useSelectionGroupIcons();
  const [onlyPreviewKind, setOnlyPreviewKind] =
    useState<SelectSelectionKind | null>(null);
  const onlyGroup = sourceGroups.length === 1 ? sourceGroups[0] : null;

  if (onlyGroup) {
    return (
      <span
        className="inline-flex h-10 shrink-0 items-center justify-center px-2 text-xs font-bold"
        aria-label={formatSelectionSummary(onlyGroup)}
      >
        {formatSelectionSummary(onlyGroup)}
      </span>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger>
        <Button
          type="button"
          iconAfter={<CaretDownIcon aria-hidden="true" />}
          iconSize="xs"
          className="min-w-[4.75rem] gap-3 py-1 pr-2 pl-3 text-left"
          aria-label={`Filter selection, ${totalCount} selected`}
        >
          <span className="flex flex-col items-start gap-1 leading-none">
            <span className="text-[10px] leading-3 font-light text-primary">
              Filter
            </span>
            <span className="text-xs leading-3 font-semibold text-primary">
              {currentCount} selected
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        onPointerLeave={() => setOnlyPreviewKind(null)}
      >
        <DropdownMenuGroup className="w-56">
          {sourceGroups.map((group) => {
            const isActive = activeKinds.has(group.kind);
            const canToggle = isActive ? activeKinds.size > 1 : true;
            const isPreviewingOnly = onlyPreviewKind === group.kind;
            const showCheck = onlyPreviewKind ? isPreviewingOnly : isActive;
            const checkboxLabel = `${
              isActive ? "Exclude" : "Include"
            } ${group.label.toLowerCase()} ${isActive ? "from" : "in"} selection`;
            const quickFilterLabel = `Filter only ${group.label.toLowerCase()}`;

            return (
              <div
                key={group.kind}
                className="flex items-center gap-0.5 rounded-xs p-0.5"
              >
                <Checkbox
                  checked={isActive}
                  accentColor={colors.sky}
                  visualChecked={showCheck}
                  disabled={!canToggle}
                  onCheckedChange={() => onToggle(group.kind)}
                  className={cn(
                    "flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-xs px-1.5 text-left text-sm leading-none transition-colors hover:bg-primary-hover active:bg-primary-active data-disabled:pointer-events-none data-disabled:opacity-55",
                    isActive && "text-primary",
                  )}
                  aria-label={checkboxLabel}
                >
                  <Icon
                    size="sm"
                    className="flex items-center justify-center opacity-75"
                  >
                    {icons[group.kind]}
                  </Icon>
                  <span className="min-w-0 flex-1 truncate leading-4">
                    {group.label}
                  </span>
                  <span className="pl-1.5 text-xs leading-4 font-medium text-secondary">
                    {group.count}
                  </span>
                </Checkbox>
                <Tooltip>
                  <TooltipTrigger>
                    <button
                      type="button"
                      onPointerEnter={() => setOnlyPreviewKind(group.kind)}
                      onFocus={() => setOnlyPreviewKind(group.kind)}
                      onPointerLeave={() => setOnlyPreviewKind(null)}
                      onBlur={() => setOnlyPreviewKind(null)}
                      onClick={() => onSelect(group.kind)}
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-xs text-secondary transition-colors hover:bg-primary-hover hover:text-primary focus-visible:focus-ring active:bg-primary-active"
                      aria-label={quickFilterLabel}
                    >
                      <Icon size="sm">
                        <ArrowRightIcon weight="bold" />
                      </Icon>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="z-[70] px-2 py-1 text-xs"
                  >
                    {quickFilterLabel}
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useSelectionGroupIcons(): Record<
  SelectSelectionKind,
  React.ReactNode
> {
  const apple1 = useLgrSprite("qfood1");
  const apple2 = useLgrSprite("qfood2");
  const appleSprites = useAppleSprites();
  const killerSprite = useLgrSprite("qkiller");
  const flowerSprite = useLgrSprite("qexit");
  const pictureSprite = useLgrSprite(defaultPictureState.name);
  const textureSprite = useTextureMaskSprites().find(
    ({ texture, mask }) =>
      texture.texture === defaultTextureState.texture &&
      mask === defaultTextureState.mask,
  );
  const appleSprite =
    appleSprites.find(
      ({ animation }) => animation === defaultAppleState.animation,
    ) ?? (defaultAppleState.animation === 2 ? apple2 : apple1);

  return {
    groundVertices: (
      <VertexIcon className="opacity-100" {...getVertexIconProps("normal")} />
    ),
    grassVertices: (
      <VertexIcon className="opacity-100" {...getVertexIconProps("grass")} />
    ),
    apples: <SpriteIcon className="opacity-100" src={appleSprite.src} />,
    killers: <SpriteIcon className="opacity-100" src={killerSprite.src} />,
    flowers: <SpriteIcon className="opacity-100" src={flowerSprite.src} />,
    start: <PictureIcon className="scale-125 opacity-100" src={kuskiSrc} />,
    pictures: <PictureIcon className="opacity-100" src={pictureSprite.src} />,
    textures: (
      <PictureIcon
        className={
          textureSprite?.mask === Mask.Litt
            ? "h-3 w-3 opacity-100"
            : "opacity-100"
        }
        src={textureSprite?.maskedSrc ?? textureSprite?.src}
      />
    ),
  };
}

function SelectionActionsMenu({
  canArrange,
  canDuplicate,
  onArrange,
  onCopy,
  onDuplicate,
  onDelete,
}: {
  canArrange: boolean;
  canDuplicate: boolean;
  onArrange: (direction: ArrangeSelectionDirection) => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const modifier = useModifier();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger>
        <ToolbarButton type="button" aria-label="More selection actions">
          <DotsThreeVerticalIcon weight="light" />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom">
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={!canDuplicate}
            shortcut={`${modifier} + C`}
            onClick={onCopy}
          >
            Copy
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canDuplicate}
            shortcut={`${modifier} + D`}
            onClick={onDuplicate}
          >
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem shortcut="Delete" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={!canArrange} openOnHover>
              Arrange
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  shortcut={`${modifier} + ]`}
                  onClick={() => onArrange("forward")}
                >
                  Bring forward
                </DropdownMenuItem>
                <DropdownMenuItem
                  shortcut={`${modifier} + Shift + ]`}
                  onClick={() => onArrange("front")}
                >
                  Bring to front
                </DropdownMenuItem>
                <DropdownMenuItem
                  shortcut={`${modifier} + [`}
                  onClick={() => onArrange("backward")}
                >
                  Send backward
                </DropdownMenuItem>
                <DropdownMenuItem
                  shortcut={`${modifier} + Shift + [`}
                  onClick={() => onArrange("back")}
                >
                  Send to back
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SelectedApplesMenu({
  selectedApples,
  currentAnimation,
  currentGravity,
  onAnimationChange,
  onGravityChange,
}: {
  selectedApples: Apple[];
  currentAnimation: AppleAnimation | null;
  currentGravity: Gravity | null;
  onAnimationChange: (animation: AppleAnimation) => void;
  onGravityChange: (gravity: Gravity) => void;
}) {
  const apple1 = useLgrSprite("qfood1");
  const apple2 = useLgrSprite("qfood2");
  const appleSprites = useAppleSprites();
  const displayAnimation = currentAnimation ?? defaultAppleState.animation;
  const fallbackApples: Partial<Record<AppleAnimation, typeof apple1>> = {
    1: apple1,
    2: apple2,
  };
  const apple =
    appleSprites.find(
      ({ animation, src }) => animation === displayAnimation && src,
    ) ??
    (fallbackApples[displayAnimation] || apple1);
  const ariaLabel =
    selectedApples.length === 1 ? "Edit apple" : "Edit selected apples";

  return (
    <Popover modal={false}>
      <PopoverTrigger>
        <ToolbarButton
          type="button"
          className="relative"
          aria-label={ariaLabel}
        >
          <span className="relative block h-6 w-6">
            <SpriteIcon className="block h-full w-full" src={apple.src} />
            {currentGravity === null ? null : (
              <AppleArrowIcon gravity={currentGravity} />
            )}
          </span>
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent
        initialFocus={false}
        finalFocus={false}
        side="bottom"
        align="center"
        className="z-50 outline-hidden"
      >
        <AppleToolbar
          role="group"
          tabIndex={-1}
          withShortcuts={false}
          currentAnimation={currentAnimation}
          currentGravity={currentGravity}
          orientation="horizontal"
          onAnimationChange={onAnimationChange}
          onGravityChange={onGravityChange}
        />
      </PopoverContent>
    </Popover>
  );
}

function getSelectedApples(selectedObjects: Position[], apples: Apple[]) {
  return selectedObjects
    .map((selectedObject) =>
      apples.find((apple) => apple.position === selectedObject),
    )
    .filter((apple): apple is Apple => Boolean(apple));
}

function getCommonAppleAnimation(apples: Apple[]): AppleAnimation | null {
  if (apples.length === 0) return null;
  const animation = apples[0].animation;
  return apples.every((apple) => apple.animation === animation)
    ? animation
    : null;
}

function getCommonAppleGravity(apples: Apple[]): Gravity | null {
  if (apples.length === 0) return null;
  const gravity = apples[0].gravity;
  return apples.every((apple) => apple.gravity === gravity) ? gravity : null;
}

function updateSelectedApples(
  apples: Apple[],
  selectedApples: Apple[],
  values: Partial<Pick<Apple, "animation" | "gravity">>,
) {
  const selectedPositions = new Set(
    selectedApples.map((apple) => apple.position),
  );
  return apples.map((apple) =>
    selectedPositions.has(apple.position) ? { ...apple, ...values } : apple,
  );
}

function getSelectedPolygons(selectToolState: SelectToolState) {
  return Array.from(
    new Set(selectToolState.selectedVertices.map(({ polygon }) => polygon)),
  );
}

function getSelectedPictures(
  selectToolState: Pick<SelectToolState, "selectedPictures">,
  pictures: Picture[],
) {
  return selectToolState.selectedPictures
    .map((position) => findPictureByPosition(pictures, position))
    .filter((picture): picture is Picture => Boolean(picture));
}

function getCommonPictureDistance(selectedPictures: Picture[]) {
  if (selectedPictures.length === 0) return "mixed";
  const distance = selectedPictures[0].distance;
  return selectedPictures.every((picture) => picture.distance === distance)
    ? distance
    : "mixed";
}

function getCommonPictureClip(selectedPictures: Picture[]) {
  if (selectedPictures.length === 0) return "mixed";
  const clip = selectedPictures[0].clip;
  return selectedPictures.every((picture) => picture.clip === clip)
    ? clip
    : "mixed";
}

function captureSelectionFilterSource(
  selectToolState: SelectToolState,
): SelectionFilterSource {
  return {
    selectedVertices: [...selectToolState.selectedVertices],
    selectedObjects: [...selectToolState.selectedObjects],
    selectedPictures: [...selectToolState.selectedPictures],
  };
}

function getSelectionFilterKey(selectToolState: SelectToolState) {
  const position = selectToolState.contextMenuPosition;
  return position ? `${position.x}:${position.y}` : "selection";
}

function getSelectionGroups(
  selectToolState: SelectionFilterSource,
  editorSelectionSources: {
    apples: { position: Position }[];
    killers: Position[];
    flowers: Position[];
    start: Position;
    pictures: Picture[];
  },
) {
  const groups: SelectionGroup[] = [];
  const selectedObjects = selectToolState.selectedObjects;

  addSelectionGroup(groups, {
    kind: "groundVertices",
    label: "Ground vertices",
    singularLabel: "ground vertex",
    count: selectToolState.selectedVertices.filter(
      ({ polygon }) => !polygon.grass,
    ).length,
  });
  addSelectionGroup(groups, {
    kind: "grassVertices",
    label: "Grass vertices",
    singularLabel: "grass vertex",
    count: selectToolState.selectedVertices.filter(
      ({ polygon }) => polygon.grass,
    ).length,
  });
  addSelectionGroup(groups, {
    kind: "apples",
    label: "Apples",
    singularLabel: "apple",
    count: selectedObjects.filter((object) =>
      editorSelectionSources.apples.some((apple) => apple.position === object),
    ).length,
  });
  addSelectionGroup(groups, {
    kind: "killers",
    label: "Killers",
    singularLabel: "killer",
    count: selectedObjects.filter((object) =>
      editorSelectionSources.killers.includes(object),
    ).length,
  });
  addSelectionGroup(groups, {
    kind: "flowers",
    label: "Flowers",
    singularLabel: "flower",
    count: selectedObjects.filter((object) =>
      editorSelectionSources.flowers.includes(object),
    ).length,
  });
  addSelectionGroup(groups, {
    kind: "start",
    label: "Start",
    singularLabel: "start",
    count: selectedObjects.includes(editorSelectionSources.start) ? 1 : 0,
  });

  const selectedPictures = getSelectedPictures(
    selectToolState,
    editorSelectionSources.pictures,
  );
  addSelectionGroup(groups, {
    kind: "pictures",
    label: "Pictures",
    singularLabel: "picture",
    count: selectedPictures.filter((picture) => Boolean(picture.name)).length,
  });
  addSelectionGroup(groups, {
    kind: "textures",
    label: "Textures",
    singularLabel: "texture",
    count: selectedPictures.filter((picture) => Boolean(picture.texture))
      .length,
  });

  return groups;
}

function addSelectionGroup(groups: SelectionGroup[], group: SelectionGroup) {
  if (group.count > 0) groups.push(group);
}

function formatSelectionSummary(group: SelectionGroup) {
  return `${group.count} ${
    group.count === 1 ? group.singularLabel : group.label.toLowerCase()
  }`;
}

function getContextMenuAnchorPosition(canvasPosition: Position) {
  return canvasPosition;
}

function findPictureByPosition(pictures: Picture[], position: Position) {
  return pictures.find((picture) => picture.position === position) ?? null;
}

function createRectAnchor(
  position: Position,
  canvas: HTMLCanvasElement | null,
  size: { width: number; height: number },
): PointAnchor {
  const canvasRect = canvas?.getBoundingClientRect();
  const left = (canvasRect?.left ?? 0) + position.x;
  const top = (canvasRect?.top ?? 0) + position.y;

  return {
    getBoundingClientRect() {
      return DOMRect.fromRect({
        x: left,
        y: top,
        width: size.width,
        height: size.height,
      });
    },
  };
}
