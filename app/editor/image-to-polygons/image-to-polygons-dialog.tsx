import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { useEditorStore } from "../use-editor-store";
import type { Polygon } from "../elma-types";
import type { SelectToolState } from "../edit-mode/tools/select-tool";
import { colors } from "../constants";
import {
  algorithms,
  defaultOptions,
  type AlgorithmId,
  type TraceOptions,
  type TraceResult,
  type WorkerReply,
} from "./types";

type Source = {
  image: ImageData;
  name: string;
  originalWidth: number;
  originalHeight: number;
};
type Settings = Record<AlgorithmId, TraceOptions>;
type Selection = {
  id: AlgorithmId;
  source: Source;
  options: TraceOptions;
  result: TraceResult;
};

export function ImageToPolygonsDialog({ onClose }: { onClose: () => void }) {
  const store = useEditorStore();
  const [source, setSource] = useState<Source | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [maxSide, setMaxSide] = useState(512);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<Settings>(
    () =>
      Object.fromEntries(
        algorithms.map((a) => [a.id, { ...defaultOptions }]),
      ) as Settings,
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [runAll, setRunAll] = useState(0);
  const [outlines, setOutlines] = useState(false);
  const [worldWidth, setWorldWidth] = useState(20);
  const [placement, setPlacement] = useState(() => {
    const polygons = store.getState().polygons;
    let x = 0,
      y = Infinity;
    for (const polygon of polygons)
      for (const vertex of polygon.vertices) {
        x = Math.max(x, vertex.x);
        y = Math.min(y, vertex.y);
      }
    return { x: x + 5, y: Number.isFinite(y) ? y : 0 };
  });
  const decodeVersion = useRef(0);
  useEffect(
    () => () => {
      decodeVersion.current++;
    },
    [],
  );

  async function loadFile(nextFile: File, limit: number) {
    const version = ++decodeVersion.current;
    setFile(nextFile);
    setLoading(true);
    setError("");
    setSelection(null);
    setSource(null);
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(nextFile.type))
        throw new Error("Choose a PNG, JPG or WebP image.");
      const bitmap = await createImageBitmap(nextFile);
      try {
        const scale = Math.min(
          1,
          limit / Math.max(bitmap.width, bitmap.height),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not decode the image.");
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        if (decodeVersion.current === version)
          setSource({
            image: context.getImageData(0, 0, canvas.width, canvas.height),
            name: nextFile.name,
            originalWidth: bitmap.width,
            originalHeight: bitmap.height,
          });
      } finally {
        bitmap.close();
      }
    } catch (error) {
      if (decodeVersion.current === version)
        setError(
          error instanceof Error ? error.message : "Could not open the image.",
        );
    } finally {
      if (decodeVersion.current === version) setLoading(false);
    }
  }

  function updateOptions(id: AlgorithmId, patch: Partial<TraceOptions>) {
    setSettings((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
    setSelection((current) => (current?.id === id ? null : current));
  }
  function updateCommon(patch: Partial<TraceOptions>) {
    setSettings(
      (current) =>
        Object.fromEntries(
          algorithms.map((a) => [a.id, { ...current[a.id], ...patch }]),
        ) as Settings,
    );
    setSelection(null);
  }
  function importResult() {
    if (
      !selection ||
      selection.source !== source ||
      selection.options !== settings[selection.id] ||
      !(worldWidth > 0)
    )
      return;
    try {
      const state = store.getState();
      const scale = worldWidth / source.image.width;
      const polygons: Polygon[] = selection.result.polygons.map((p) => ({
        grass: false,
        vertices: p.vertices.map((v) => ({
          x: placement.x + v.x * scale,
          y: placement.y + v.y * scale,
        })),
      }));
      if (!polygons.length) return;
      state.actions.getActiveTool()?.clear?.();
      state.actions.activateTool("select");
      state.actions.setPolygons([...state.polygons, ...polygons]);
      state.actions.setToolState<SelectToolState>("select", {
        selectedVertices: polygons.flatMap((polygon) =>
          polygon.vertices.map((vertex) => ({ polygon, vertex })),
        ),
        selectedObjects: [],
        selectedPictures: [],
        hoveredObject: undefined,
        hoveredPictureBounds: undefined,
        contextMenuType: undefined,
      });
      state.actions.triggerFitToView();
      onClose();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not import polygons.",
      );
    }
  }

  const common = settings.binary;
  const canImport =
    selection &&
    selection.source === source &&
    selection.options === settings[selection.id] &&
    selection.result.polygons.length > 0 &&
    worldWidth > 0;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[min(1280px,calc(100vw-2rem))]">
        <DialogHeader showCloseButton>
          <DialogTitle>
            Image to polygons{" "}
            <span className="ml-2 text-xs font-normal text-secondary">
              Experimental
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="gap-5">
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="grid content-start gap-2">
              <label className="grid gap-2 text-xs">
                Image
                <input
                  aria-label="Image file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const value = event.target.files?.[0];
                    if (value) void loadFile(value, maxSide);
                  }}
                  className="max-w-full text-xs"
                />
              </label>
              {source && (
                <>
                  <SourcePreview source={source} />
                  <span className="text-xs text-secondary">
                    {source.name}
                    <br />
                    {source.image.width} × {source.image.height} px processed
                    <br />
                    {source.originalWidth} × {source.originalHeight} px original
                  </span>
                </>
              )}
              {loading && (
                <p role="status" className="text-sm">
                  Opening image…
                </p>
              )}
            </div>
            <div className="grid content-start gap-3">
              <p className="text-sm text-secondary">
                All processing stays in your browser. Color tracers keep color
                boundaries, then map dark regions to ground or sky. Previews use
                Elma’s nested polygon fill.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-xs">
                  Processing resolution
                  <select
                    aria-label="Processing resolution"
                    className="rounded border border-default bg-screen p-2"
                    value={maxSide}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setMaxSide(value);
                      if (file) void loadFile(file, value);
                    }}
                  >
                    {[256, 512, 1024, 2048, 4096].map((v) => (
                      <option key={v} value={v}>
                        {v} px longest side
                      </option>
                    ))}
                  </select>
                </label>
                <NumberField
                  label="Dark threshold"
                  value={common.threshold}
                  min={1}
                  max={255}
                  onChange={(threshold) => updateCommon({ threshold })}
                />
                <NumberField
                  label="Blur (px)"
                  value={common.blur}
                  min={0}
                  max={8}
                  step={0.25}
                  onChange={(blur) => updateCommon({ blur })}
                />
                <NumberField
                  label="Simplification (px)"
                  value={common.simplify}
                  min={0}
                  max={20}
                  step={0.1}
                  onChange={(simplify) => updateCommon({ simplify })}
                />
                <NumberField
                  label="Curve error (px)"
                  value={common.curveTolerance}
                  min={0.05}
                  max={5}
                  step={0.05}
                  onChange={(curveTolerance) =>
                    updateCommon({ curveTolerance })
                  }
                />
                <NumberField
                  label="Minimum region (px²)"
                  value={common.minArea}
                  min={0}
                  max={10000}
                  onChange={(minArea) => updateCommon({ minArea })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <Toggle
                  label="Dark regions are ground"
                  checked={common.darkGround}
                  onChange={(darkGround) => updateCommon({ darkGround })}
                />
                <Toggle
                  label="Decompose holes into triangles"
                  checked={common.decompose}
                  onChange={(decompose) => updateCommon({ decompose })}
                />
                <Toggle
                  label="Polygon edges"
                  checked={outlines}
                  onChange={setOutlines}
                />
                <Button
                  size="sm"
                  variant="accent"
                  disabled={!source || loading}
                  onClick={() => setRunAll((value) => value + 1)}
                >
                  Compare all
                </Button>
              </div>
              <p className="text-xs text-secondary">
                Import adds a selected group beside the level by default, with
                one undo step. Ground mode includes a sky frame. Overlapping
                existing polygons changes ground/sky parity.
              </p>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          {source && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {algorithms.map((algorithm) => (
                <AlgorithmCard
                  key={algorithm.id}
                  algorithm={algorithm}
                  source={source}
                  options={settings[algorithm.id]}
                  runAll={runAll}
                  outlines={outlines}
                  selected={selection?.id === algorithm.id}
                  onChange={(patch) => updateOptions(algorithm.id, patch)}
                  onSelect={(result) =>
                    setSelection({
                      id: algorithm.id,
                      source,
                      options: settings[algorithm.id],
                      result,
                    })
                  }
                />
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter className="sticky bottom-0 flex-wrap items-end border-t border-default bg-screen">
          <div className="mr-auto flex flex-wrap gap-3">
            <NumberField
              label="Width (world units)"
              value={worldWidth}
              min={0.01}
              max={10000}
              step={0.1}
              onChange={setWorldWidth}
            />
            <NumberField
              label="Import X"
              value={placement.x}
              min={-100000}
              max={100000}
              step={0.1}
              onChange={(x) => setPlacement((p) => ({ ...p, x }))}
            />
            <NumberField
              label="Import Y"
              value={placement.y}
              min={-100000}
              max={100000}
              step={0.1}
              onChange={(y) => setPlacement((p) => ({ ...p, y }))}
            />
          </div>
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="accent"
            disabled={!canImport}
            onClick={importResult}
          >
            Import{" "}
            {selection
              ? algorithms.find((a) => a.id === selection.id)?.name
              : "selected result"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlgorithmCard({
  algorithm,
  source,
  options,
  runAll,
  outlines,
  selected,
  onChange,
  onSelect,
}: {
  algorithm: (typeof algorithms)[number];
  source: Source;
  options: TraceOptions;
  runAll: number;
  outlines: boolean;
  selected: boolean;
  onChange: (patch: Partial<TraceOptions>) => void;
  onSelect: (result: TraceResult) => void;
}) {
  const [run, setRun] = useState(0);
  const [stoppedAt, setStoppedAt] = useState<{
    run: number;
    runAll: number;
  } | null>(null);
  const paused = stoppedAt?.run === run && stoppedAt.runAll === runAll;
  const [state, setState] = useState<{
    source: Source;
    options: TraceOptions;
    result?: TraceResult;
    error?: string;
    busy?: boolean;
  } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const id = algorithm.id;
  useEffect(() => {
    if ((!runAll && !run) || paused) return;
    let worker: Worker | null = null;
    const timer = window.setTimeout(() => {
      setState({ source, options, busy: true });
      try {
        worker = new Worker(new URL("./trace.worker.ts", import.meta.url), {
          type: "module",
        });
        workerRef.current = worker;
        worker.onmessage = (event: MessageEvent<WorkerReply>) => {
          setState({ source, options, ...event.data });
          worker?.terminate();
          workerRef.current = null;
        };
        worker.onerror = (event) => {
          setState({
            source,
            options,
            error: event.message || "The tracing worker failed.",
          });
          worker?.terminate();
          workerRef.current = null;
        };
        worker.postMessage({ id, image: source.image, options });
      } catch (error) {
        setState({
          source,
          options,
          error:
            error instanceof Error ? error.message : "Could not start tracing.",
        });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      worker?.terminate();
      workerRef.current = null;
    };
  }, [source, options, runAll, run, paused, id]);
  const current =
    state?.source === source && state.options === options ? state : null;
  const result = current?.result;
  const busy =
    !paused &&
    Boolean(current?.busy || ((!current || current.busy) && (runAll || run)));
  return (
    <section
      className={`grid content-start gap-3 rounded-lg border p-3 ${selected ? "border-blue-400" : "border-default"}`}
      aria-label={algorithm.name}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{algorithm.name}</h3>
        <Button
          size="sm"
          onClick={() => {
            setStoppedAt(null);
            setRun((v) => v + 1);
          }}
        >
          Run
        </Button>
      </div>
      <p className="min-h-12 text-xs text-secondary">{algorithm.description}</p>
      <div className="flex min-h-52 items-center justify-center overflow-hidden rounded bg-black/20">
        {result ? (
          <PolygonPreview result={result} source={source} outlines={outlines} />
        ) : (
          <span className="p-4 text-sm text-secondary">
            {busy ? "Tracing…" : paused ? "Stopped" : "No result yet"}
          </span>
        )}
      </div>
      {busy && (
        <Button
          size="sm"
          onClick={() => {
            workerRef.current?.terminate();
            setStoppedAt({ run, runAll });
          }}
        >
          Stop
        </Button>
      )}
      <div
        className="flex min-h-5 justify-between gap-2 text-xs text-secondary"
        role="status"
      >
        {result && (
          <>
            <span>
              {result.polygons.length.toLocaleString()} polygons ·{" "}
              {result.polygons
                .reduce((n, p) => n + p.vertices.length, 0)
                .toLocaleString()}{" "}
              vertices
            </span>
            <span>{Math.round(result.milliseconds).toLocaleString()} ms</span>
          </>
        )}
      </div>
      <div className="grid gap-2">
        {["binary", "imagetracer", "vtracer", "contours"].includes(id) && (
          <Toggle
            label={id === "contours" ? "Interpolate edges" : "Smooth curves"}
            checked={options.smooth}
            onChange={(smooth) => onChange({ smooth })}
          />
        )}
        {(id === "imagetracer" || id === "vtracer") && (
          <NumberField
            label={
              id === "vtracer" ? "Color levels per channel" : "Palette colors"
            }
            value={options.colors}
            min={2}
            max={id === "vtracer" ? 256 : 64}
            onChange={(colors) => onChange({ colors })}
          />
        )}
        {id === "vtracer" && (
          <NumberField
            label="Corner threshold (°)"
            value={options.corner}
            min={0}
            max={180}
            onChange={(corner) => onChange({ corner })}
          />
        )}
        {id === "centerline" && (
          <NumberField
            label="Stroke width (px)"
            value={options.strokeWidth}
            min={0.25}
            max={30}
            step={0.25}
            onChange={(strokeWidth) => onChange({ strokeWidth })}
          />
        )}
      </div>
      {current?.error && (
        <p role="alert" className="text-xs text-red-400">
          {current.error}
        </p>
      )}
      {result?.warnings.map((warning) => (
        <p className="text-xs text-amber-300" key={warning}>
          {warning}
        </p>
      ))}
      <Button
        size="sm"
        variant={selected ? "accent" : "default"}
        disabled={!result || busy || paused}
        onClick={() => {
          if (result) onSelect(result);
        }}
      >
        {selected ? "Selected" : "Use this result"}
      </Button>
    </section>
  );
}

function SourcePreview({ source }: { source: Source }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    ref.current?.getContext("2d")?.putImageData(source.image, 0, 0);
  }, [source]);
  return (
    <canvas
      ref={ref}
      width={source.image.width}
      height={source.image.height}
      className="max-h-44 w-full rounded bg-white object-contain"
      aria-label="Source image"
    />
  );
}

function PolygonPreview({
  result,
  source,
  outlines,
}: {
  result: TraceResult;
  source: Source;
  outlines: boolean;
}) {
  const path = result.polygons
    .map(
      (p) =>
        p.vertices.map((v, i) => `${i ? "L" : "M"}${v.x},${v.y}`).join(" ") +
        "Z",
    )
    .join(" ");
  return (
    <svg
      viewBox={`-2 -2 ${source.image.width + 4} ${source.image.height + 4}`}
      className="max-h-64 w-full"
      aria-label="Generated Elma polygons"
      role="img"
    >
      <rect
        x={-2}
        y={-2}
        width={source.image.width + 4}
        height={source.image.height + 4}
        fill={colors.ground}
      />
      <path
        d={path}
        fill={colors.sky}
        fillRule="evenodd"
        stroke={outlines ? colors.edges : "none"}
        strokeWidth={0.6}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-xs">
      {label}
      <input
        aria-label={label}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        className="w-full min-w-16 rounded border border-default bg-screen px-2 py-1.5"
        onChange={(event) => {
          const value = event.target.valueAsNumber;
          if (Number.isFinite(value) && value >= min && value <= max)
            onChange(value);
        }}
      />
    </label>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
