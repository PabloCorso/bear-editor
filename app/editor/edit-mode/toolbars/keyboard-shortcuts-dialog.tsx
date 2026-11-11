import type { DialogProps } from "~/components/ui/dialog";
import {
  CursorIcon,
  HandIcon,
  PaintBucketIcon,
  TextTIcon,
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
  OPEN_AI_PROMPT_LIBRARY_SHORTCUT,
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
      showDesktopDevelopmentShortcuts:
        typeof window !== "undefined" &&
        Boolean(window.bearDesktop?.development),
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
