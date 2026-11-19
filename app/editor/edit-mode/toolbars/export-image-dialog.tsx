import {
  DownloadSimpleIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
} from "~/components/ui/collapsible";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "~/components/ui/segmented-control";
import { useCallback, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  downloadImage,
  getImageFileName,
} from "~/editor/helpers/download-image";
import { writeFile } from "~/editor/helpers/file-system-access";
import type {
  ImageExport,
  ImageExportOptions,
} from "~/editor/helpers/image-export";

export function ExportImageDialog({
  snapshot,
  initialFileName,
  onClose,
}: {
  snapshot: ImageExport;
  initialFileName?: string;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<ImageExportOptions>({
    appearance: "shown",
    area: "level",
    scale: 1,
  });
  const [fileName, setFileName] = useState(() =>
    getImageFileName(initialFileName),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const canChooseLocation =
    typeof window !== "undefined" && "showSaveFilePicker" in window;
  const [destination, setDestination] = useState("download");
  const { appearance, area } = options;
  const previewRef = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image) return;
      try {
        image.src = snapshot.preview({ appearance, area, scale: 1 });
        setPreviewError(null);
      } catch (error) {
        image.removeAttribute("src");
        setPreviewError(
          error instanceof Error
            ? error.message
            : "Could not generate preview.",
        );
      }
    },
    [snapshot, appearance, area],
  );
  const dimensions = snapshot.dimensions(options);

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      // Open the picker before awaiting rendering, while user activation is active.
      const handle =
        destination === "choose"
          ? await window.showSaveFilePicker({
              suggestedName: getImageFileName(fileName),
              types: [
                { description: "PNG image", accept: { "image/png": [".png"] } },
              ],
            })
          : undefined;
      const blob = await snapshot.toBlob(options);
      if (handle) await writeFile(handle, blob);
      else downloadImage(blob, fileName);
      onClose();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setError(
          error instanceof Error ? error.message : "Failed to export image.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="gap-2 px-4 py-3" showCloseButton={!busy}>
          <DialogTitle className="text-base">Export image</DialogTitle>
        </DialogHeader>
        <DialogBody className="gap-4 px-4 pb-4">
          <div className="overflow-hidden rounded-lg border border-default bg-black/20">
            <div className="flex min-h-28 items-center justify-center p-4">
              {previewError && (
                <p className="text-sm text-secondary" role="alert">
                  {previewError}
                </p>
              )}
              <img
                ref={previewRef}
                alt="Export preview"
                hidden={!!previewError}
                className="h-auto max-h-52 w-auto max-w-full object-contain"
              />
            </div>
            <div className="flex items-center justify-between border-t border-default px-3 py-2 text-[11px] text-secondary">
              <span>PNG</span>
              <span>
                {dimensions.width.toLocaleString()} ×{" "}
                {dimensions.height.toLocaleString()} px
              </span>
            </div>
          </div>
          <Input
            aria-label="Filename"
            disabled={busy}
            value={fileName}
            className="h-9 w-full rounded-md border-default bg-primary/40 px-3"
            onChange={(event) => setFileName(event.target.value)}
          />
          <Collapsible className="overflow-hidden rounded-lg border border-default bg-primary/20">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-secondary transition-colors hover:bg-primary/40 hover:text-primary aria-expanded:text-primary">
              <span className="flex items-center gap-2">
                <SlidersHorizontalIcon className="size-3.5" aria-hidden />
                Export options
              </span>
            </CollapsibleTrigger>
            <CollapsiblePanel>
              <fieldset
                disabled={busy}
                className="grid gap-3 border-t border-default p-3 disabled:opacity-50"
              >
                <ExportOption
                  label="Area"
                  value={area}
                  onChange={(area) => setOptions({ ...options, area })}
                  items={[
                    { value: "level", label: "Whole level" },
                    { value: "view", label: "Current view" },
                  ]}
                />
                <ExportOption
                  label="Appearance"
                  value={appearance}
                  onChange={(appearance) =>
                    setOptions({ ...options, appearance })
                  }
                  items={[
                    {
                      value: "shown",
                      label: "Current",
                      hint: "Keep visibility settings and editor overlays",
                    },
                    {
                      value: "game",
                      label: "Game",
                      hint: "All textures and objects, without editor overlays",
                    },
                  ]}
                />
                <ExportOption
                  label="Resolution"
                  value={options.scale}
                  onChange={(scale) => setOptions({ ...options, scale })}
                  items={[1, 2, 4].map((scale) => ({
                    value: scale,
                    label: `${scale}×`,
                  }))}
                />
                {canChooseLocation && (
                  <ExportOption
                    label="Save to"
                    value={destination}
                    onChange={setDestination}
                    items={[
                      { value: "download", label: "Downloads" },
                      {
                        value: "choose",
                        label: "Choose…",
                        hint: "Choose save location",
                      },
                    ]}
                  />
                )}
              </fieldset>
            </CollapsiblePanel>
          </Collapsible>
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter className="gap-2 border-t border-default px-4 py-3">
          <Button size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="accent"
            iconBefore={<DownloadSimpleIcon />}
            disabled={busy || !!previewError}
            onClick={() => void handleExport()}
          >
            {busy ? "Exporting…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExportOption<Value extends string | number>({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: Value;
  onChange: (value: Value) => void;
  items: { value: Value; label: string; hint?: string }[];
}) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-xs text-secondary">{label}</span>
      <SegmentedControl
        aria-label={label}
        value={value}
        onValueChange={onChange}
        className="flex w-full"
      >
        {items.map((item) => (
          <SegmentedControlItem
            key={item.value}
            value={item.value}
            title={item.hint}
            className="min-h-8 px-1.5 text-xs leading-4 whitespace-nowrap"
          >
            {item.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </div>
  );
}
