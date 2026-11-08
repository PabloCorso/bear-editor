import { KuskiIcon } from "~/components/kuski-icon";
import { PictureIcon } from "~/components/sprite-icon";
import { useLgrSprite } from "~/components/use-lgr-assets";
import type { Avatar } from "./types";

export function ElmaAvatar({
  avatar,
  color,
}: {
  avatar: Avatar;
  color?: string;
}) {
  const sprite = useLgrSprite(
    avatar === "apple" ? "qfood1" : avatar === "flower" ? "qexit" : "qkiller",
  );
  return (
    <span
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-default bg-screen"
      style={{ borderColor: color }}
      aria-hidden
    >
      {avatar === "rider" ? (
        <KuskiIcon className="size-4" color={color} />
      ) : (
        <PictureIcon className="size-5" src={sprite.src} />
      )}
    </span>
  );
}
