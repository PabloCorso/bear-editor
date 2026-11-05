import { useEffect, useRef } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { ToolbarButton } from "~/components/ui/toolbar";
import type { HistoryTransaction } from "~/editor/history/transaction-history";
import {
  DEFAULT_REFERENCE_IMAGE_OPACITY,
  type ReferenceImage,
} from "~/editor/reference-images";
import { useEditorStore } from "~/editor/use-editor-store";

export function ImageOpacityControl({ images }: { images: ReferenceImage[] }) {
  const store = useEditorStore();
  const transaction = useRef<HistoryTransaction | null>(null);
  const opacity = images[0].opacity ?? DEFAULT_REFERENCE_IMAGE_OPACITY;
  const mixed = images.some(
    (image) => (image.opacity ?? DEFAULT_REFERENCE_IMAGE_OPACITY) !== opacity,
  );
  const percentage = Math.round(opacity * 100);
  const complete = () => {
    transaction.current?.complete();
    transaction.current = null;
  };

  useEffect(() => () => transaction.current?.complete(), []);

  return (
    <Popover
      modal={false}
      onOpenChange={(open) => {
        if (!open) complete();
      }}
    >
      <PopoverTrigger>
        <ToolbarButton
          className="w-auto min-w-10 px-2 text-xs tabular-nums"
          aria-label={`Image opacity: ${mixed ? "Mixed" : `${percentage}%`}`}
          title="Image opacity"
        >
          {mixed ? "Mixed" : `${percentage}%`}
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        finalFocus={false}
        className="z-50 w-56 rounded-xl border border-default bg-screen p-3 shadow-sm outline-hidden"
      >
        <label className="flex flex-col gap-3 text-sm">
          <span className="flex items-center justify-between gap-3">
            <span>Opacity</span>
            <span className="text-secondary tabular-nums">
              {mixed ? "Mixed" : `${percentage}%`}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={percentage}
            aria-label="Image opacity"
            aria-valuetext={mixed ? "Mixed" : `${percentage}%`}
            className="w-full cursor-pointer accent-blue-500 focus-visible:focus-ring"
            onChange={(event) => {
              const nextOpacity = Number(event.currentTarget.value) / 100;
              if (!transaction.current?.active) {
                transaction.current = store.history.begin({
                  kind: "reference-image.opacity",
                });
              }
              transaction.current.update(() => {
                images.forEach((image) =>
                  store.getState().actions.updateReferenceImage(image.id, {
                    opacity: nextOpacity,
                  }),
                );
              });
            }}
            onPointerUp={complete}
            onPointerCancel={complete}
            onKeyUp={complete}
            onBlur={complete}
          />
        </label>
      </PopoverContent>
    </Popover>
  );
}
