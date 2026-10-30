import type { ReactNode } from "react";
import { formatTime } from "elmajs";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  type DialogProps,
} from "~/components/ui/dialog";
import { useEditor } from "~/editor/use-editor-store";
import type { LevelTop10 } from "~/editor/elma-types";
import { calculateBoundingBox } from "~/editor/helpers/level-helpers";

export function LevelPropertiesDialog(props: DialogProps) {
  return (
    <Dialog {...props}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-lg">
        <DialogHeader showCloseButton>
          <DialogTitle>Level properties</DialogTitle>
        </DialogHeader>
        <DialogBody className="min-h-0 gap-0 overflow-y-auto pb-5">
          <LevelProperties />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function LevelProperties() {
  const title = useEditor((state) => state.levelName);
  const fileName = useEditor((state) =>
    /\.lev$/i.test(state.documentSession.displayName)
      ? state.documentSession.displayName
      : "Unsaved level",
  );
  const lgr = useEditor((state) => state.lgr);
  const ground = useEditor((state) => state.ground);
  const sky = useEditor((state) => state.sky);
  const polygons = useEditor((state) => state.polygons);
  const apples = useEditor((state) => state.apples);
  const killers = useEditor((state) => state.killers);
  const flowers = useEditor((state) => state.flowers);
  const pictures = useEditor((state) => state.pictures);
  const top10 = useEditor((state) => state.top10);
  const groundPolygons = polygons.filter((polygon) => !polygon.grass);
  const grassPolygons = polygons.filter((polygon) => polygon.grass);
  const vertices = (items: typeof polygons) =>
    items.reduce((count, polygon) => count + polygon.vertices.length, 0);
  const bounds = calculateBoundingBox({ polygons });
  const dimension = (min: number, max: number) =>
    (Number.isFinite(max - min) ? max - min : 0).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  const count = (value: number) => value.toLocaleString();
  const countWithLabel = (value: number, label: string, plural = `${label}s`) =>
    `${count(value)} ${value === 1 ? label : plural}`;
  const lgrName = lgr.trim().replace(/\.lgr$/i, "") || "default";
  const lgrFileName = `${lgrName.toLowerCase() === "default" ? "Default" : lgrName}.lgr`;

  return (
    <>
      <section className="pb-4">
        <dl className="flex flex-col text-sm">
          <DetailRow label="File" value={fileName} />
          <DetailRow label="Title" value={title || "None"} />
          <DetailRow label="LGR" value={lgrFileName} />
          <DetailRow label="Ground texture" value={ground} />
          <DetailRow label="Sky texture" value={sky} />
          <DetailRow
            label="Ground"
            value={`${countWithLabel(groundPolygons.length, "polygon")} · ${countWithLabel(vertices(groundPolygons), "vertex", "vertices")}`}
          />
          <DetailRow
            label="Grass"
            value={`${countWithLabel(grassPolygons.length, "polygon")} · ${countWithLabel(vertices(grassPolygons), "vertex", "vertices")}`}
          />
          <DetailRow
            label="Total"
            value={`${countWithLabel(polygons.length, "polygon")} · ${countWithLabel(vertices(polygons), "vertex", "vertices")}`}
          />
          <DetailRow
            label="Size"
            value={`${dimension(bounds.minX, bounds.maxX)} × ${dimension(bounds.minY, bounds.maxY)}`}
          />
          <DetailRow label="Apples" value={count(apples.length)} />
          <DetailRow label="Killers" value={count(killers.length)} />
          <DetailRow label="Flowers" value={count(flowers.length)} />
          <DetailRow
            label="Pictures"
            value={count(
              pictures.filter((picture) => Boolean(picture.name)).length,
            )}
          />
          <DetailRow
            label="Textures"
            value={count(
              pictures.filter((picture) => Boolean(picture.texture)).length,
            )}
          />
        </dl>
      </section>
      <section
        className="flex flex-col gap-3 border-t border-separator pt-4"
        aria-labelledby="times-heading"
      >
        <h3 id="times-heading" className="text-sm font-semibold">
          Finish times
        </h3>
        <FinishTimes label="Single player" entries={top10?.single ?? []} />
        <FinishTimes
          label="Multiplayer"
          entries={top10?.multi ?? []}
          multiplayer
        />
      </section>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-h-8 items-baseline justify-between gap-6 py-1.5">
      <dt className="text-secondary">{label}</dt>
      <dd className="min-w-0 text-right break-words tabular-nums">{value}</dd>
    </div>
  );
}

function FinishTimes({
  label,
  entries,
  multiplayer = false,
}: {
  label: string;
  entries: LevelTop10["single"];
  multiplayer?: boolean;
}) {
  const sorted = [...entries].sort((a, b) => a.time - b.time).slice(0, 10);
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-sm font-medium text-secondary">{label}</h4>
      {sorted.length === 0 ? (
        <p className="py-1.5 text-sm">None</p>
      ) : (
        <ol className="flex flex-col text-sm tabular-nums">
          {sorted.map((entry, index) => (
            <li
              key={index}
              className="flex min-h-8 items-baseline gap-3 py-1.5"
            >
              <span className="w-5 shrink-0 text-secondary">{index + 1}</span>
              <span className="min-w-0 flex-1 break-words">
                {multiplayer
                  ? `${entry.name1 || "Unnamed"} & ${entry.name2 || "Unnamed"}`
                  : entry.name1 || "Unnamed"}
              </span>
              <span className="shrink-0 font-mono">
                {formatTime(entry.time)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
