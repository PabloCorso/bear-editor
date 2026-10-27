import type { DialogProps } from "~/components/ui/dialog";
import {
  CursorIcon,
  HandIcon,
  PaintBucketIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { Icon } from "~/components/ui/icon";
import { PictureIcon, SpriteIcon } from "~/components/sprite-icon";
import {
  useAppleSprites,
  useLgrSprite,
  usePictureSprites,
  useTextureMaskSprites,
} from "~/components/use-lgr-assets";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import {
  usePlaySettings,
  useVertexEdgeClickPreference,
} from "~/editor/use-editor-store";
import { cn, useModifier } from "~/utils/misc";
import {
  getAutoGrassAllShortcut,
  VertexIcon,
  getVertexIconProps,
} from "./vertex-tool-control";
import {
  getNewLevelShortcut,
  formatShortcutCode,
  GO_TO_PLAY_START_SHORTCUT,
  OPEN_KEYBOARD_SHORTCUTS_SHORTCUT,
} from "./keyboard-shortcuts";

type ShortcutGroup = {
  title: string;
  items: ShortcutItem[];
};

type ShortcutItem = {
  shortcut: Shortcut;
  label: string;
  icon?: React.ReactNode;
  subItems?: ShortcutSubItem[];
};

type ShortcutSubItem = {
  shortcut: Shortcut;
  label: string;
  icon?: React.ReactNode;
};

type Shortcut = string | string[];

export function KeyboardShortcutsDialog(props: DialogProps) {
  const modifier = useModifier();
  const appleDefaultSprite = useLgrSprite("qfood1");
  const killerSprite = useLgrSprite("qkiller");
  const flowerSprite = useLgrSprite("qexit");
  const appleSprites = useAppleSprites();
  const pictureSprites = usePictureSprites();
  const textureMaskSprites = useTextureMaskSprites();
  const playSettings = usePlaySettings();
  const vertexEdgeClickBehavior = useVertexEdgeClickPreference();
  const appleSprite = appleSprites[0]?.src ?? appleDefaultSprite.src;
  const pictureSprite = pictureSprites[0]?.src;
  const textureSprite =
    textureMaskSprites[0]?.maskedSrc ?? textureMaskSprites[0]?.src;
  const shortcutGroups = getShortcutGroups(
    { modifier },
    {
      appleSprite,
      killerSprite: killerSprite.src,
      flowerSprite: flowerSprite.src,
      pictureSprite,
      textureSprite,
      playKeyBindings: playSettings.keyBindings,
      showVertexInternalEdgeClickHint: vertexEdgeClickBehavior === "internal",
    },
  );

  return (
    <Dialog {...props}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-xl">
        <DialogHeader showCloseButton>
          <DialogTitle className="text-2xl">Shortcuts</DialogTitle>
        </DialogHeader>

        <DialogBody className="min-h-0 gap-8 overflow-y-auto px-2 pb-6 sm:px-6">
          {shortcutGroups.map((group) => (
            <ShortcutGroupSection key={group.title} group={group} />
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutGroupSection({ group }: { group: ShortcutGroup }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="pl-16 text-lg font-bold tracking-tight sm:pl-[84px] sm:text-xl">
        {group.title}
      </h2>

      <div>
        {group.items.map((item, index) =>
          item.subItems?.length ? (
            <Collapsible key={item.label}>
              <ShortcutRow item={item} isFirst={index === 0} expandable />
              <CollapsiblePanel className="ml-4 sm:ml-9">
                {item.subItems.map((subItem) => (
                  <ShortcutRow
                    key={subItem.label}
                    item={subItem}
                    isFirst={false}
                    nested
                  />
                ))}
              </CollapsiblePanel>
            </Collapsible>
          ) : (
            <ShortcutRow key={item.label} item={item} isFirst={index === 0} />
          ),
        )}
      </div>
    </section>
  );
}

function ShortcutRow({
  item,
  isFirst,
  expandable = false,
  nested = false,
}: {
  item: ShortcutItem | ShortcutSubItem;
  isFirst: boolean;
  expandable?: boolean;
  nested?: boolean;
}) {
  const Content = expandable ? CollapsibleTrigger : "div";
  return (
    <div
      className={cn(
        "min-h-10",
        nested
          ? "flex pr-2 pl-12 sm:pr-6 sm:pl-[84px]"
          : "grid grid-cols-[2rem_minmax(4.75rem,7rem)_1fr] items-center gap-x-2 px-2 sm:grid-cols-[2.5rem_minmax(6rem,8rem)_1fr] sm:gap-x-5 sm:px-6",
      )}
    >
      {!nested ? (
        <div className="flex h-8 w-8 items-center justify-center text-primary/85">
          {item.icon ? <Icon size="lg">{item.icon}</Icon> : null}
        </div>
      ) : null}
      <Content
        className={cn(
          "min-h-10 w-full",
          nested
            ? "flex items-stretch gap-x-2 border-x px-2 sm:gap-x-3"
            : "col-span-2 col-start-2 grid h-full items-center gap-x-4 sm:gap-x-5",
          !nested &&
            (expandable
              ? "grid-cols-[minmax(4.75rem,7rem)_1fr_auto] hover:bg-primary-hover/50 sm:grid-cols-[minmax(6rem,8rem)_1fr_auto]"
              : "grid-cols-[minmax(4.75rem,7rem)_1fr] sm:grid-cols-[minmax(6rem,8rem)_1fr]"),
          isFirst && "border-t border-separator",
          "border-b border-separator",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center",
            nested ? "shrink-0" : "h-full",
          )}
        >
          <ShortcutKeys shortcut={item.shortcut} />
          {nested ? (
            <span
              aria-hidden
              className="ml-2 w-px shrink-0 self-stretch bg-separator"
            />
          ) : null}
        </div>
        <span className="self-center text-sm leading-5 text-primary/85">
          {item.label}
        </span>
      </Content>
    </div>
  );
}

function ShortcutKeys({ shortcut }: { shortcut: Shortcut }) {
  if (typeof shortcut === "string") {
    return (
      <span className="font-mono text-sm leading-5 font-bold tracking-tight">
        {shortcut}
      </span>
    );
  }

  const hasSeparators = shortcut.join("") !== "←↑→↓";
  const hasFixedKeyCells = shortcut.every((key) => key.length === 1);

  return (
    <span className="flex h-full min-w-0 items-center gap-x-2 font-mono text-sm leading-5 font-bold tracking-tight">
      {shortcut.map((key, index) => (
        <span key={`${key}-${index}`} className="contents">
          {index > 0 && hasSeparators ? (
            <span aria-hidden className="h-full w-px bg-separator" />
          ) : null}
          <span
            className={cn("shrink-0", hasFixedKeyCells && "w-4 text-center")}
          >
            {key}
          </span>
        </span>
      ))}
    </span>
  );
}

function getShortcutGroups(
  {
    modifier,
  }: {
    modifier: string;
  },
  toolIcons: {
    appleSprite?: string;
    killerSprite?: string;
    flowerSprite?: string;
    pictureSprite?: string;
    textureSprite?: string;
    playKeyBindings: ReturnType<typeof usePlaySettings>["keyBindings"];
    showVertexInternalEdgeClickHint?: boolean;
  },
): ShortcutGroup[] {
  return [
    {
      title: "Tools",
      items: [
        {
          shortcut: defaultTools.select.shortcut,
          label: defaultTools.select.name,
          icon: <CursorIcon weight="light" />,
          subItems: [
            {
              shortcut: `${modifier} + A`,
              label: "Select all visible",
            },
            {
              shortcut: "Shift",
              label: "Select object behind images",
            },
            { shortcut: "Alt + Click", label: "Select edge endpoints" },
            {
              shortcut: `${modifier} + Alt + Click`,
              label: "Add edge endpoints to selection",
            },
            {
              shortcut: "Right click",
              label: "Open selection context menu",
            },
            {
              shortcut: `${modifier} + C`,
              label: "Copy selection (excluding starts and session artifacts)",
            },
            {
              shortcut: `${modifier} + V`,
              label: "Paste selection",
            },
            {
              shortcut: `${modifier} + D`,
              label:
                "Duplicate selection (excluding starts and session artifacts)",
            },
            {
              shortcut: "Delete",
              label: "Delete selection (including test players)",
            },
            {
              shortcut: "Shift + Drag",
              label: "Move selected vertices along an edge",
            },
            {
              shortcut: "R",
              label: "Toggle resize & rotate",
            },
            {
              shortcut: `${modifier} + Drag`,
              label: "Resize & rotate: preserve corner resize proportions",
            },
            {
              shortcut: "Corner + Drag",
              label: "Resize & rotate: rotate just outside any corner",
            },
            {
              shortcut: `${modifier} + Drag`,
              label: "Resize & rotate: snap rotation to 45°",
            },
            {
              shortcut: `${modifier} + ]`,
              label: "Bring picture forward",
            },
            {
              shortcut: `${modifier} + [`,
              label: "Send picture backward",
            },
            {
              shortcut: `${modifier} + Shift + ]`,
              label: "Bring picture to front",
            },
            {
              shortcut: `${modifier} + Shift + [`,
              label: "Send picture to back",
            },
          ],
        },
        {
          shortcut: defaultTools.hand.shortcut,
          label: defaultTools.hand.name,
          icon: <HandIcon weight="light" />,
        },
        {
          shortcut: defaultTools.vertex.shortcut,
          label: "Select Vertex tool",
          icon: (
            <VertexIcon {...getVertexIconProps("normal")} className="h-6 w-6" />
          ),
          subItems: [
            ...(toolIcons.showVertexInternalEdgeClickHint
              ? [
                  {
                    shortcut: `${modifier} + Click`,
                    label: "Edit polygon edge in internal mode",
                  },
                ]
              : []),
            {
              shortcut: "Space",
              label: "Flip direction",
            },
            {
              shortcut: ["Enter", "Esc", "Right click"],
              label: "Finish polygon",
            },
          ],
        },
        {
          shortcut: defaultTools.vertex.variants.grass.shortcut,
          label: "Select Grass tool",
          icon: (
            <VertexIcon {...getVertexIconProps("grass")} className="h-6 w-6" />
          ),
          subItems: [
            { shortcut: "Space", label: "Flip direction" },
            {
              shortcut: ["Enter", "Esc", "Right click"],
              label: "Finish polygon",
            },
          ],
        },
        {
          shortcut: defaultTools.vertex.variants.draw.shortcut,
          label: "Select Draw tool",
          icon: (
            <VertexIcon {...getVertexIconProps("draw")} className="h-6 w-6" />
          ),
          subItems: [
            {
              shortcut: ["-", "+"],
              label: "Adjust edge length",
            },
            {
              shortcut: ["Enter", "Esc", "Right click"],
              label: "Finish polygon",
            },
          ],
        },
        {
          shortcut: defaultTools.vertex.variants.pipe.shortcut,
          label: "Select Pipe tool",
          icon: (
            <VertexIcon {...getVertexIconProps("pipe")} className="h-6 w-6" />
          ),
          subItems: [
            { shortcut: ["-", "+"], label: "Adjust width" },
            {
              shortcut: "Space",
              label:
                "Cycle mode: no apples / apples by distance / apples by count",
            },
            {
              shortcut: ["[", "]"],
              label:
                "Decrease / increase apple distance (0.25 units) or count (1 apple)",
            },
            {
              shortcut: "0–250",
              label:
                "Type apple count in count mode; pause briefly to start a new number",
            },
            { shortcut: "S", label: "Toggle start chamber and player" },
            { shortcut: "F", label: "Toggle end flower" },
            {
              shortcut: ["Enter", "Esc", "Right click"],
              label: "Finish pipe",
            },
          ],
        },
        {
          shortcut: defaultTools.vertex.variants.cutConnect.shortcut,
          label: "Select Cut & Connect tool",
          icon: (
            <VertexIcon
              {...getVertexIconProps("cutConnect")}
              className="h-6 w-6"
            />
          ),
          subItems: [
            { shortcut: ["-", "+"], label: "Adjust width" },
            { shortcut: "Enter", label: "Apply at cursor" },
            { shortcut: ["Esc", "Right click"], label: "Cancel stroke" },
          ],
        },
        {
          shortcut: defaultTools.vertex.variants.frame.shortcut,
          label: "Select Frame tool",
          icon: (
            <VertexIcon {...getVertexIconProps("frame")} className="h-6 w-6" />
          ),
          subItems: [
            { shortcut: ["-", "+"], label: "Adjust frame width" },
            {
              shortcut: "Space",
              label: "Cycle mode: Inside / Outside / Centered",
            },
          ],
        },
        {
          shortcut: ["Esc", "Right click"],
          label: "Cancel polygon operation",
        },
        {
          shortcut: defaultTools.vertex.variants.smooth.shortcut,
          label: "Smooth tool",
          icon: (
            <VertexIcon {...getVertexIconProps("smooth")} className="h-6 w-6" />
          ),
          subItems: [
            {
              shortcut: ["-", "+"],
              label:
                "Adjust amount: negative simplifies, positive rounds corners",
            },
            {
              shortcut: ["[", "]"],
              label: "Adjust offset",
            },
          ],
        },
        {
          shortcut: defaultTools.vertex.variants.brush.shortcut,
          label: "Select Brush tool",
          icon: (
            <VertexIcon {...getVertexIconProps("brush")} className="h-6 w-6" />
          ),
          subItems: [
            { shortcut: ["-", "+"], label: "Adjust width" },
            {
              shortcut: [",", "."],
              label: "Adjust centerline edge length",
            },
            { shortcut: "Space", label: "Cycle apple mode" },
            { shortcut: ["[", "]"], label: "Adjust apple distance or count" },
            { shortcut: "0–250", label: "Type apple count in count mode" },
            { shortcut: "S", label: "Toggle start chamber and player" },
            { shortcut: "F", label: "Toggle end flower" },
            {
              shortcut: ["Enter", "Esc", "Right click"],
              label: "Finish brush stroke",
            },
          ],
        },
        {
          shortcut: defaultTools.vertex.variants.autoGrass.shortcut,
          label: "Select AutoGrass tool",
          icon: (
            <VertexIcon
              {...getVertexIconProps("autoGrass")}
              className="h-6 w-6"
            />
          ),
        },
        {
          shortcut: getAutoGrassAllShortcut(modifier),
          label: "AutoGrass level",
          icon: (
            <VertexIcon
              {...getVertexIconProps("autoGrass")}
              className="h-6 w-6"
            />
          ),
          subItems: [
            {
              shortcut: ["-", "+"],
              label: "Adjust height (AutoGrass tool or hovering All)",
            },
            {
              shortcut: ["[", "]"],
              label:
                "Decrease / increase end inset (AutoGrass tool or hovering All)",
            },
          ],
        },
        {
          shortcut: defaultTools.apple.shortcut,
          label: defaultTools.apple.name,
          icon: <SpriteIcon className="h-5 w-5" src={toolIcons.appleSprite} />,
          subItems: [
            {
              shortcut: "1-9",
              label: "Change apple animation",
            },
            {
              shortcut: "N",
              label: "Set no gravity",
            },
            {
              shortcut: ["Shift + ↑", "Shift + ↓", "Shift + ←", "Shift + →"],
              label: "Set directional gravity",
            },
          ],
        },
        {
          shortcut: defaultTools.killer.shortcut,
          label: defaultTools.killer.name,
          icon: <SpriteIcon className="h-5 w-5" src={toolIcons.killerSprite} />,
        },
        {
          shortcut: defaultTools.flower.shortcut,
          label: defaultTools.flower.name,
          icon: <SpriteIcon className="h-5 w-5" src={toolIcons.flowerSprite} />,
        },
        {
          shortcut: defaultTools.picture.shortcut,
          label: defaultTools.picture.name,
          icon: (
            <PictureIcon
              className="h-5 w-5 bg-contain bg-center bg-no-repeat"
              src={toolIcons.pictureSprite}
            />
          ),
        },
        {
          shortcut: defaultTools.color.shortcut,
          label: defaultTools.color.name,
          icon: <PaintBucketIcon className="h-5 w-5" weight="fill" />,
        },
        {
          shortcut: defaultTools.texture.shortcut,
          label: defaultTools.texture.name,
          icon: (
            <PictureIcon
              className="h-5 w-5 bg-contain bg-center bg-no-repeat"
              src={toolIcons.textureSprite}
            />
          ),
        },
      ],
    },
    {
      title: "Tool menus",
      items: [
        {
          shortcut: ["A", "P", "T", "C"],
          label: "Activate and open options; press again to close",
        },
        {
          shortcut: ["V", "G", "…"],
          label: "Select the tool without opening the Vertex menu",
        },
        {
          shortcut: "Enter",
          label:
            "Accept the focused choice or keep the current choice and close the panel",
        },
        {
          shortcut: "Esc",
          label: "Close the panel and keep the tool active",
        },
      ],
    },
    {
      title: "Picture, texture, and color placement",
      items: [
        {
          shortcut: "Right click",
          label: "Open placement properties at the cursor",
        },
        {
          shortcut: "Esc",
          label: "Close placement properties and resume placement",
        },
      ],
    },
    {
      title: "Picture distance field",
      items: [
        {
          shortcut: ["↑", "↓"],
          label: "Increase / decrease distance by 1 while focused",
        },
        {
          shortcut: ["Home", "End"],
          label: "Set distance to 0 / 999 while focused",
        },
        {
          shortcut: "Enter",
          label: "Commit distance and leave the field",
        },
      ],
    },
    {
      title: "Play mode",
      items: [
        {
          shortcut: "Enter",
          label: "Start / restart run (outside dialogs and tool panels)",
        },
        {
          shortcut: "Enter",
          label:
            "With only one Kuski selected: use it as play start and start run",
        },
        {
          shortcut: formatShortcutCode(toolIcons.playKeyBindings.throttle),
          label: "Throttle",
        },
        {
          shortcut: formatShortcutCode(toolIcons.playKeyBindings.brake),
          label: "Brake",
        },
        {
          shortcut: formatShortcutCode(toolIcons.playKeyBindings.voltLeft),
          label: "Rotate left",
        },
        {
          shortcut: formatShortcutCode(toolIcons.playKeyBindings.voltRight),
          label: "Rotate right",
        },
        {
          shortcut: formatShortcutCode(toolIcons.playKeyBindings.turn),
          label: "Turn",
        },
        {
          shortcut: formatShortcutCode(toolIcons.playKeyBindings.aloVolt),
          label: "Alo volt",
        },
        {
          shortcut: formatShortcutCode(toolIcons.playKeyBindings.rewind),
          label: "Hold to rewind; release to continue",
        },
        {
          shortcut: formatShortcutCode(toolIcons.playKeyBindings.captureStart),
          label: "Capture ride and history as the active test start",
        },
        {
          shortcut: "Esc",
          label: "Exit play mode",
        },
      ],
    },
    {
      title: "General",
      items: [
        {
          shortcut: "Alt",
          label: "Hold to bypass grid snapping while placing or dragging",
        },
        {
          shortcut: "Enter",
          label: "Save player name while renaming",
        },
        {
          shortcut: "Esc",
          label: "Cancel player rename",
        },
        {
          shortcut: getNewLevelShortcut(modifier === "⌘"),
          label: "New level",
        },
        {
          shortcut: `${modifier} + O`,
          label: "Open",
        },
        {
          shortcut: `${modifier} + S`,
          label: "Save",
        },
        {
          shortcut: `${modifier} + ,`,
          label: "Settings",
        },
        {
          shortcut: OPEN_KEYBOARD_SHORTCUTS_SHORTCUT,
          label: "Open keyboard shortcuts",
        },
      ],
    },
    {
      title: "Navigation",
      items: [
        {
          shortcut: `${modifier} + Z`,
          label: "Undo",
        },
        {
          shortcut: `${modifier} + Y`,
          label: "Redo",
        },
        {
          shortcut: "+",
          label: "Zoom in",
        },
        {
          shortcut: "-",
          label: "Zoom out",
        },
        {
          shortcut: `${modifier} + 0`,
          label: "Fit to view",
        },
        {
          shortcut: ["←", "↑", "→", "↓"],
          label: "Pan canvas",
        },
        {
          shortcut: GO_TO_PLAY_START_SHORTCUT,
          label: "Go to active play start (in edit mode)",
        },
      ],
    },
  ];
}
