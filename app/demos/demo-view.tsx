import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import type { ScriptedRide } from "~/editor/play-mode/scripted-ride";
import { LgrAssetsProvider, useLgrAssets } from "~/components/use-lgr-assets";
import { TooltipProvider } from "~/components/ui/tooltip";
import { createEditorStore } from "~/editor/editor-store";
import { EditorStoreProvider, useEditorStore } from "~/editor/use-editor-store";
import { DefaultLevelPresetProvider } from "~/editor/edit-mode/default-level-preset";
import { EditorDocumentGuardProvider } from "~/editor/session/document-guard";
import { EditorSurface } from "~/editor/app-shell";
import type { EditorEngine } from "~/editor/edit-mode/engine/editor-engine";
import type { InitialDocument } from "~/editor/edit-mode/editor-view";
import { calculateBoundingBox } from "~/editor/helpers/level-helpers";
import { DemoPlayer, type DemoCursor } from "./demo-player";
import type { Demo } from "./commands";

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
  return (
    <TooltipProvider>
      <LgrAssetsProvider bundledOnly>
        <DefaultLevelPresetProvider>
          <EditorStoreProvider store={store}>
            <EditorDocumentGuardProvider enabled={false}>
              <DemoPlayback
                name={name}
                loadDemo={loadDemo}
                onReplay={onReplay}
              />
            </EditorDocumentGuardProvider>
          </EditorStoreProvider>
        </DefaultLevelPresetProvider>
      </LgrAssetsProvider>
    </TooltipProvider>
  );
}

function DemoPlayback({
  name,
  loadDemo,
  onReplay,
}: DemoViewProps & { onReplay: () => void }) {
  const store = useEditorStore();
  const { isLoaded, selectLgr, error: lgrError } = useLgrAssets();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [demo, setDemo] = useState<Demo>();
  const [ready, setReady] = useState<{
    engine: EditorEngine;
    canvas: HTMLCanvasElement;
  }>();
  const [cursor, setCursor] = useState<DemoCursor | null>(null);
  const [stage, setStage] = useState("Loading demo…");
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [scriptedRide, setScriptedRide] = useState<ScriptedRide>();
  const onReady = useCallback(
    (engine: EditorEngine, canvas: HTMLCanvasElement) => {
      setReady({ engine, canvas });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void loadDemo()
      .then((definition) => {
        if (!cancelled) setDemo(definition);
      })
      .catch((error) => {
        console.error("Could not load demo", error);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [loadDemo]);

  useEffect(() => {
    if (demo) void selectLgr(demo.initial.lgr || "default");
  }, [demo, selectLgr]);

  const initialDocument = useMemo<InitialDocument | undefined>(
    () =>
      demo
        ? {
            status: "done",
            document: {
              level: demo.initial,
              origin: { kind: "default", label: "Demo", canOverwrite: false },
            },
          }
        : undefined,
    [demo],
  );

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!demo || !ready || !surface || !isLoaded) return;
    const { engine, canvas } = ready;
    const controller = new AbortController();
    const { signal } = controller;

    // Reserve space around the level for the real header and side toolbar.
    const fit = () => {
      const { minX, maxX, minY, maxY } = calculateBoundingBox(demo.target);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const left = 78;
      const top = 64;
      const right = 16;
      const bottom = 74;
      const zoom = Math.max(
        0.1,
        Math.min(
          100,
          (width - left - right) / (maxX - minX + 4),
          (height - top - bottom) / (maxY - minY + 4),
        ),
      );
      store.getState().actions.setZoom(zoom);
      store
        .getState()
        .actions.setCamera(
          (width + left - right) / 2 - ((minX + maxX) / 2) * zoom,
          (height + top - bottom) / 2 - ((minY + maxY) / 2) * zoom,
        );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    const player = new DemoPlayer({
      store,
      engine,
      canvas,
      surface,
      signal,
      onCursor: setCursor,
      onStage: ({ label }) => setStage(label),
      setScriptedRide,
    });
    void player
      .run(demo.commands)
      .then(() => {
        if (!signal.aborted) setStatus("done");
      })
      .catch((error) => {
        if (signal.aborted) return;
        console.error("Demo playback failed", error);
        setStatus("error");
        setCursor(null);
      });
    return () => {
      controller.abort();
      observer.disconnect();
    };
  }, [demo, ready, isLoaded, store]);

  const failed = status === "error" || Boolean(lgrError);
  return (
    <main className="flex h-[100dvh] flex-col bg-neutral-950 text-white">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-3">
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
        <div
          className="absolute inset-0 isolate flex text-primary"
          ref={(element) => {
            if (element) element.inert = true;
          }}
        >
          {initialDocument && isLoaded && (
            <EditorSurface
              initialDocument={initialDocument}
              readOnly
              onReady={onReady}
              scriptedRide={scriptedRide}
            />
          )}
        </div>
        {cursor && (
          <div
            className="pointer-events-none absolute z-50 text-white drop-shadow-[0_2px_2px_rgba(0,0,0,.9)]"
            style={{ left: cursor.x, top: cursor.y }}
          >
            {cursor.pressed && (
              <div className="absolute -top-3 -left-3 size-6 rounded-full border-2 border-white bg-white/25" />
            )}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              className="overflow-visible"
              aria-hidden="true"
            >
              <path
                d="M0 0 L19 13 L11 14 L8 21 Z"
                fill="white"
                stroke="#171717"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
        {(!ready || failed) && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-950/80 p-6 text-center">
            {failed ? "Could not load demo. Try replaying." : "Loading demo…"}
          </div>
        )}
      </div>
      <div
        className="flex h-16 shrink-0 items-center justify-center px-4 py-2 text-center text-sm font-medium"
        aria-live="polite"
        aria-atomic="true"
      >
        {failed ? "Demo unavailable" : stage}
      </div>
    </main>
  );
}
