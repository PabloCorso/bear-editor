import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  CursorIcon,
  PolygonIcon,
  CircleIcon,
  PlantIcon,
  ImageIcon,
  EyeIcon,
  PlayIcon,
  ArrowClockwiseIcon,
} from "@phosphor-icons/react";
import { LgrAssets } from "~/components/lgr-assets";
import { createEditorStore } from "~/editor/editor-store";
import { EditorEngine } from "~/editor/edit-mode/engine/editor-engine";
import { SelectTool } from "~/editor/edit-mode/tools/select-tool";
import { VertexTool } from "~/editor/edit-mode/tools/vertex-tool";
import { AppleTool } from "~/editor/edit-mode/tools/apple-tools";
import { PictureTool } from "~/editor/edit-mode/tools/picture-tool";
import { fitToView } from "~/editor/helpers/camera-helpers";
import {
  VertexIcon,
  getVertexIconProps,
} from "~/editor/edit-mode/toolbars/vertex-tool-control";
import { DemoPlayer, type DemoCursor, type DemoStage } from "./demo-player";
import type { Demo, DemoTool } from "./commands";
import { playDemoRide } from "./demo-playtest";

const tools = [
  { id: "select", label: "Select tool", Icon: CursorIcon },
  { id: "vertex", label: "Vertex", Icon: PolygonIcon },
  { id: "apple", label: "Apple", Icon: CircleIcon },
  { id: "autoGrass", label: "AutoGrass level", Icon: PlantIcon },
  { id: "picture", label: "Picture", Icon: ImageIcon },
  { id: "playtest", label: "Playtest", Icon: PlayIcon },
  { id: "preview", label: "Preview", Icon: EyeIcon },
] as const;

type DemoViewProps = { name: string; loadDemo: () => Promise<Demo> };

export function DemoView(props: DemoViewProps) {
  const [run, setRun] = useState(0);
  return (
    <DemoSession
      {...props}
      key={run}
      onReplay={() => setRun((value) => value + 1)}
    />
  );
}

function DemoSession({
  name,
  loadDemo,
  onReplay,
}: DemoViewProps & { onReplay: () => void }) {
  const [store] = useState(() => createEditorStore({ analytics: false }));
  const title = useStore(store, (state) => state.levelName);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playCanvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<DemoCursor | null>(null);
  const [appleSprite, setAppleSprite] = useState<string>();
  const [isPlaytesting, setIsPlaytesting] = useState(false);
  const [stage, setStage] = useState<DemoStage>({
    tool: "select",
    label: "Loading demo…",
  });
  const [status, setStatus] = useState<
    "loading" | "playing" | "done" | "error"
  >("loading");

  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = surfaceRef.current;
    if (!canvas || !surface) return;
    const controller = new AbortController();
    const { signal } = controller;
    const assets = new LgrAssets();
    let engine: EditorEngine | undefined;
    let observer: ResizeObserver | undefined;

    async function start() {
      try {
        const [demo] = await Promise.all([loadDemo(), assets.load()]);
        if (signal.aborted) {
          assets.destroy();
          return;
        }
        if (!canvas || !surface) return;
        setAppleSprite(assets.getSpritePreview("qfood1"));

        canvas.width = surface.clientWidth;
        canvas.height = surface.clientHeight;
        engine = new EditorEngine(canvas, {
          store,
          tools: [SelectTool, VertexTool, AppleTool, PictureTool],
          lgrAssets: assets,
          readOnly: true,
          initialDocument: {
            level: demo.initial,
            origin: { kind: "default", label: "Demo", canOverwrite: false },
          },
        });
        const fit = () => {
          const { actions } = store.getState();
          engine?.resize(surface.clientWidth, surface.clientHeight);
          fitToView({
            canvas,
            ...demo.target,
            minZoom: 0.1,
            maxZoom: 100,
            setCamera: actions.setCamera,
            setZoom: actions.setZoom,
          });
        };
        fit();
        observer = new ResizeObserver(fit);
        observer.observe(surface);

        const toolbarPosition = (target: DemoTool | "title") => {
          const rect = surface
            .querySelector(`[data-demo-target="${target}"]`)
            ?.getBoundingClientRect();
          const bounds = surface.getBoundingClientRect();
          return rect
            ? {
                x: rect.left + rect.width / 2 - bounds.left,
                y: rect.top + rect.height / 2 - bounds.top,
              }
            : { x: 16, y: 16 };
        };
        const player = new DemoPlayer({
          store,
          signal,
          onCursor: setCursor,
          onStage: setStage,
          toolbarPosition,
          playtest: async (duration) => {
            const playCanvas = playCanvasRef.current;
            if (!playCanvas) return;
            setIsPlaytesting(true);
            try {
              await playDemoRide(playCanvas, store, assets, duration, signal);
            } finally {
              if (!signal.aborted) setIsPlaytesting(false);
            }
          },
        });
        setStatus("playing");
        await player.run(demo.commands);
        if (!signal.aborted) setStatus("done");
      } catch (error) {
        if (signal.aborted) {
          assets.destroy();
          return;
        }
        console.error("Demo playback failed", error);
        setStatus("error");
        setCursor(null);
      }
    }
    void start();
    return () => {
      controller.abort();
      observer?.disconnect();
      engine?.destroy();
      assets.destroy();
    };
  }, [store, loadDemo]);

  return (
    <main className="flex h-[100dvh] flex-col bg-neutral-950 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <p className="text-xs font-medium text-neutral-400">
            Bear Editor · Demo
          </p>
          <h1 className="text-base font-semibold">{name}</h1>
        </div>
        <button
          className="flex items-center gap-2 rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 focus-visible:outline focus-visible:outline-white"
          type="button"
          onClick={onReplay}
        >
          <ArrowClockwiseIcon size={18} /> Replay
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden" ref={surfaceRef}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          aria-label="Animated level editor demonstration"
        />
        <canvas
          ref={playCanvasRef}
          className={`absolute inset-0 h-full w-full ${isPlaytesting ? "" : "invisible"}`}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
          <div
            data-demo-target="title"
            className="max-w-full truncate rounded-lg bg-neutral-900/95 px-3 py-2 text-sm font-medium shadow-lg"
          >
            {title || "Untitled"}
          </div>
          <div className="flex items-center gap-0.5 rounded-lg bg-neutral-900/95 p-1 shadow-lg">
            {tools.map(({ id, label, Icon }) => (
              <div
                key={id}
                title={label}
                data-demo-target={id}
                className={`flex size-8 items-center justify-center rounded-md sm:size-9 ${stage.tool === id ? "bg-white text-neutral-950" : "text-neutral-300"}`}
              >
                {id === "vertex" || id === "autoGrass" ? (
                  <VertexIcon
                    {...getVertexIconProps(
                      id === "vertex" ? "normal" : "autoGrass",
                    )}
                    className="size-5"
                  />
                ) : id === "apple" && appleSprite ? (
                  <img
                    src={appleSprite}
                    alt=""
                    className="size-5 object-contain"
                  />
                ) : (
                  <Icon size={20} />
                )}
              </div>
            ))}
          </div>
          {stage.picture && (
            <div className="basis-full text-right">
              <span className="rounded bg-neutral-900/95 px-3 py-1 text-xs">
                {stage.picture}
              </span>
            </div>
          )}
        </div>
        {cursor && (
          <div
            className="pointer-events-none absolute z-10 text-white drop-shadow-[0_2px_2px_rgba(0,0,0,.9)]"
            style={{ left: cursor.x, top: cursor.y }}
          >
            {cursor.pressed && (
              <div className="absolute -top-3 -left-3 size-6 rounded-full border-2 border-white bg-white/25" />
            )}
            <CursorIcon
              size={24}
              weight="fill"
              className="-translate-x-0.5 -translate-y-0.5"
            />
          </div>
        )}
        {(status === "loading" || status === "error") && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/80 p-6 text-center">
            {status === "loading"
              ? "Loading demo…"
              : "Could not load demo. Try replaying."}
          </div>
        )}
      </div>
      <div
        className="flex min-h-12 items-center justify-center px-4 py-2 text-sm font-medium"
        aria-live="polite"
      >
        {status === "error" ? "Demo unavailable" : stage.label}
      </div>
    </main>
  );
}
