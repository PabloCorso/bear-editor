import { useCallback } from "react";
import { getKuskiPreview } from "~/editor/render/kuski-preview";
import { PictureIcon } from "./sprite-icon";
import { useLgrAssets } from "./use-lgr-assets";
import { cn } from "~/utils/misc";

export function KuskiIcon({
  color = "#ffffff",
  className,
  ...props
}: React.ComponentPropsWithRef<"span"> & { color?: string }) {
  const { lgr, isLoaded } = useLgrAssets();
  const renderPreview = useCallback(
    (node: HTMLSpanElement | null) => {
      if (!node || !isLoaded) return;
      const src = getKuskiPreview(lgr, color);
      node.style.backgroundImage = src ? `url(${src})` : "";
    },
    [lgr, isLoaded, color],
  );
  return (
    <PictureIcon
      aria-hidden
      {...props}
      className={cn("size-6 scale-[1.3333]", className)}
      ref={renderPreview}
    />
  );
}
