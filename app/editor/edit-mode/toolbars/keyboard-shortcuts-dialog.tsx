import type { DialogProps } from "~/components/ui/dialog";
import { CursorIcon, HandIcon } from "@phosphor-icons/react/dist/ssr";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
import { PictureIcon, SpriteIcon } from "~/components/sprite-icon";
import {
  useAppleSprites,
  useLgrSprite,
  usePictureSprites,
  useTextureMaskSprites,
} from "~/components/use-lgr-assets";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import { usePlaySettings } from "~/editor/use-editor-store";
import { cn, useModifier } from "~/utils/misc";
import { VertexIcon } from "./vertex-tool-control";
import { OPEN_KEYBOARD_SHORTCUTS_SHORTCUT } from "./keyboard-shortcuts";

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
  const appleSprite = appleSprites[0]?.src ?? appleDefaultSprite.src;
  const pictureSprite = pictureSprites[0]?.src;
  const textureSprite =
    textureMaskSprites[0]?.maskedSrc ?? textureMaskSprites[0]?.src;
  const shortcutGroups = getShortcutGroups(modifier, {
    appleSprite,
    killerSprite: killerSprite.src,
    flowerSprite: flowerSprite.src,
    pictureSprite,
    textureSprite,
    playKeyBindings: playSettings.keyBindings,
  });

  return (
    <Dialog {...props}>
      <DialogContent
        className="grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-xl"
        onKeyDown={(event) => {
          // Prevent the editor from reacting to shortcuts while the dialog is open.
          event.stopPropagation();
        }}
      >
        <DialogHeader showCloseButton>
          <DialogTitle className="text-2xl">Shortcuts</DialogTitle>
        </DialogHeader>

        <DialogBody className="min-h-0 gap-8 overflow-y-auto pb-6">
          {shortcutGroups.map((group) => (
            <ShortcutGroupSection key={group.title} group={group} />
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutGroupSection({ group }: { group: ShortcutGroup }) {
  const flattenedItems = group.items.flatMap((item) => [
    item,
    ...(item.subItems?.map((subItem) => ({
      ...subItem,
      isSubtleChild: true,
    })) ?? []),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="pl-16 text-lg font-bold tracking-tight sm:pl-[84px] sm:text-xl">
        {group.title}
      </h2>

      <div>
        {flattenedItems.map((item, index) => (
          <ShortcutRow
            key={`${group.title}-${item.label}`}
            item={item}
            isFirst={index === 0}
          />
        ))}
      </div>
    </section>
  );
}

function ShortcutRow({
  item,
  isFirst,
}: {
  item: ShortcutItem | (ShortcutSubItem & { isSubtleChild: true });
  isFirst: boolean;
}) {
  return (
    <div className="grid h-10 grid-cols-[2rem_minmax(4.75rem,7rem)_1fr] items-center gap-x-4 px-4 sm:grid-cols-[2.5rem_minmax(6rem,8rem)_1fr] sm:gap-x-5 sm:px-6">
      <div className="flex h-8 w-8 items-center justify-center text-primary/85">
        {item.icon ? <Icon size="lg">{item.icon}</Icon> : null}
      </div>
      <div
        className={cn(
          "col-span-2 col-start-2 grid h-full grid-cols-[minmax(4.75rem,7rem)_1fr] items-center gap-x-4 sm:grid-cols-[minmax(6rem,8rem)_1fr] sm:gap-x-5",
          isFirst && "border-t border-separator",
          "border-b border-separator",
        )}
      >
        <ShortcutKeys shortcut={item.shortcut} />
        <div className="text-sm leading-5 text-primary/85">{item.label}</div>
      </div>
    </div>
  );
}

function ShortcutKeys({ shortcut }: { shortcut: Shortcut }) {
  if (typeof shortcut === "string") {
    return (
      <div className="font-mono text-sm leading-5 font-bold tracking-tight">
        {shortcut}
      </div>
    );
  }

  const hasSeparators = shortcut.join("") !== "←↑→↓";
  const hasFixedKeyCells = shortcut.every((key) => key.length === 1);

  return (
    <div className="flex h-full min-w-0 items-center gap-x-2 font-mono text-sm leading-5 font-bold tracking-tight">
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
    </div>
  );
}

function getShortcutGroups(
  modifier: string,
  toolIcons: {
    appleSprite?: string;
    killerSprite?: string;
    flowerSprite?: string;
    pictureSprite?: string;
    textureSprite?: string;
    playKeyBindings: ReturnType<typeof usePlaySettings>["keyBindings"];
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
              shortcut: ["Del", "Backspace"],
              label: "Erase selection",
            },
            {
              shortcut: [`${modifier} + C`, `${modifier} + V`],
              label: "Duplicate selection",
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
          label: defaultTools.vertex.name,
          icon: <VertexIcon className="h-6 w-6" />,
          subItems: [
            {
              shortcut: defaultTools.vertex.variants?.grass?.shortcut ?? "G",
              label: "Switch to grass vertex mode",
            },
            {
              shortcut: "Space",
              label: "Reverse drawing direction",
            },
            {
              shortcut: ["Enter", "Esc"],
              label: "Finish polygon or restore edit",
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
      title: "Play mode",
      items: [
        {
          shortcut: "Enter",
          label: "Start / restart run",
        },
        {
          shortcut: "Esc",
          label: "Exit play mode",
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
      ],
    },
    {
      title: "General",
      items: [
        {
          shortcut: `${modifier} + R`,
          label: "New",
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
          shortcut: ["+", "="],
          label: "Zoom in",
        },
        {
          shortcut: ["-", "_"],
          label: "Zoom out",
        },
        {
          shortcut: "1",
          label: "Fit to view",
        },
        {
          shortcut: ["←", "↑", "→", "↓"],
          label: "Pan canvas",
        },
      ],
    },
  ];
}

function formatShortcutCode(code: string): string {
  if (code === "") return "Unassigned";
  if (code === "ArrowLeft") return "←";
  if (code === "ArrowUp") return "↑";
  if (code === "ArrowRight") return "→";
  if (code === "ArrowDown") return "↓";
  if (code === "Equal") return "=";
  if (code === "Minus") return "-";
  if (code.startsWith("Key")) return code.slice(3);
  return code;
}
