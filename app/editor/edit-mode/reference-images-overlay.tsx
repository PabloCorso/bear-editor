import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEditor, useEditorStore } from "../use-editor-store";
import type { ReferenceImage } from "../reference-images";
import { referenceImagePoint } from "../reference-images";
import { Button } from "~/components/ui/button";

type Drag = {
  original: ReferenceImage;
  pointerId: number;
  startX: number;
  startY: number;
  mode: "move" | "rotate" | number;
  anchor: { x: number; y: number };
  element: HTMLElement;
};

export function ReferenceImagesOverlay() {
  const store = useEditorStore();
  const images = useEditor((state) => state.referenceImages);
  const selectedId = useEditor((state) => state.selectedReferenceImageId);
  const activeTool = useEditor((state) => state.activeToolId);
  const offset = useEditor((state) => state.viewPortOffset);
  const zoom = useEditor((state) => state.zoom);
  const playing = useEditor((state) => state.isPlayMode);
  const showUI = useEditor((state) => state.isUIVisible);
  const drag = useRef<Drag | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const selected = images.find((image) => image.id === selectedId);

  function update(id: string, patch: Partial<ReferenceImage>) {
    store.setState((state) => ({
      referenceImages: state.referenceImages.map((image) =>
        image.id === id ? { ...image, ...patch } : image,
      ),
    }));
  }

  function cancelDrag() {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    // Do not resurrect images after a document change or removal.
    update(current.original.id, current.original);
    if (current.element.hasPointerCapture(current.pointerId))
      current.element.releasePointerCapture(current.pointerId);
  }

  // A drag must not outlive its editing session, tool, or pointer capture.
  useEffect(
    function cancelInactiveImageDrag() {
      if (
        playing ||
        activeTool !== "select" ||
        !images.some((image) => image.id === drag.current?.original.id)
      ) {
        const current = drag.current;
        drag.current = null;
        if (current)
          store.setState((state) => ({
            referenceImages: state.referenceImages.map((image) =>
              image.id === current.original.id ? current.original : image,
            ),
          }));
        if (current?.element.hasPointerCapture(current.pointerId))
          current.element.releasePointerCapture(current.pointerId);
      }
    },
    [playing, activeTool, images, store],
  );

  useEffect(
    function dismissImageSelectionOnCanvasClick() {
      const parent = root.current?.parentElement;
      if (!parent) return;
      function dismiss(event: PointerEvent) {
        if (event.target instanceof HTMLCanvasElement)
          store.setState({ selectedReferenceImageId: null });
      }
      parent.addEventListener("pointerdown", dismiss, true);
      return () => parent.removeEventListener("pointerdown", dismiss, true);
    },
    [store],
  );

  useEffect(function forwardImageWheelToCanvas() {
    const element = root.current;
    if (!element) return;
    function onWheel(event: WheelEvent) {
      if (event.target instanceof Element && event.target.closest("details"))
        return;
      const canvas = element!.parentElement?.querySelector("canvas");
      if (!canvas) return;
      event.preventDefault();
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          clientX: event.clientX,
          clientY: event.clientY,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  function select(image: ReferenceImage) {
    store.getState().actions.activateTool("select");
    store.getState().actions.setToolState("select", {
      selectedVertices: [],
      selectedObjects: [],
      selectedPictures: [],
      transformMode: false,
      contextMenuType: undefined,
    });
    store.setState({ selectedReferenceImageId: image.id });
  }

  function begin(
    event: ReactPointerEvent<HTMLElement>,
    image: ReferenceImage,
    mode: Drag["mode"],
  ) {
    // Middle/right mouse and modified clicks remain available for camera controls.
    if (event.button === 2) return;
    if (
      event.button === 1 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      (event.shiftKey && mode === "move")
    ) {
      event.preventDefault();
      event.stopPropagation();
      const canvas = root.current?.parentElement?.querySelector("canvas");
      canvas?.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          isPrimary: event.isPrimary,
          button: event.button,
          buttons: event.buttons,
          clientX: event.clientX,
          clientY: event.clientY,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    select(image);
    const element = event.currentTarget;
    element.focus();
    element.setPointerCapture(event.pointerId);
    const signX =
      typeof mode === "number" && (mode === 1 || mode === 2) ? 1 : -1;
    const signY = typeof mode === "number" && mode >= 2 ? 1 : -1;
    drag.current = {
      original: image,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      mode,
      anchor: referenceImagePoint(
        image,
        (-signX * image.width) / 2,
        (-signY * image.height) / 2,
      ),
      element,
    };
  }

  function move(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const { original, mode, anchor } = current;
    const dx = (event.clientX - current.startX) / zoom;
    const dy = (event.clientY - current.startY) / zoom;
    if (mode === "move") {
      update(original.id, {
        position: { x: original.position.x + dx, y: original.position.y + dy },
      });
    } else if (mode === "rotate") {
      const rect = root.current!.getBoundingClientRect();
      const cx = original.position.x * zoom + offset.x + rect.left;
      const cy = original.position.y * zoom + offset.y + rect.top;
      let rotation =
        original.rotation +
        Math.atan2(event.clientY - cy, event.clientX - cx) -
        Math.atan2(current.startY - cy, current.startX - cx);
      if (event.shiftKey)
        rotation = (Math.round(rotation / (Math.PI / 12)) * Math.PI) / 12;
      update(original.id, { rotation });
    } else {
      const signX = mode === 1 || mode === 2 ? 1 : -1;
      const signY = mode >= 2 ? 1 : -1;
      const localX =
        dx * Math.cos(original.rotation) + dy * Math.sin(original.rotation);
      const localY =
        -dx * Math.sin(original.rotation) + dy * Math.cos(original.rotation);
      const diagonalX = signX * original.width;
      const diagonalY = signY * original.height;
      const scale = Math.max(
        0.01,
        1 +
          (localX * diagonalX + localY * diagonalY) /
            (original.width ** 2 + original.height ** 2),
      );
      const width = original.width * scale;
      const height = original.height * scale;
      const center = referenceImagePoint(
        { ...original, position: anchor },
        (signX * width) / 2,
        (signY * height) / 2,
      );
      update(original.id, { width, height, position: center });
    }
  }

  function finish(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    const element = drag.current.element;
    drag.current = null;
    if (element.hasPointerCapture(event.pointerId))
      element.releasePointerCapture(event.pointerId);
  }

  function remove(image: ReferenceImage) {
    image.bitmap.close();
    store.setState((state) => ({
      referenceImages: state.referenceImages.filter(
        (entry) => entry.id !== image.id,
      ),
      selectedReferenceImageId:
        state.selectedReferenceImageId === image.id
          ? null
          : state.selectedReferenceImageId,
    }));
  }

  return (
    <div
      ref={root}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      hidden={playing}
    >
      {activeTool === "select" &&
        images
          .filter((image) => image.visible && !image.locked)
          .map((image) => {
            const isSelected = image.id === selectedId;
            return (
              <div
                key={image.id}
                role="button"
                aria-label={`Move reference image ${image.name}`}
                tabIndex={0}
                className="pointer-events-auto absolute cursor-move outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                style={{
                  zIndex: isSelected ? 1 : 0,
                  left: image.position.x * zoom + offset.x,
                  top: image.position.y * zoom + offset.y,
                  width: image.width * zoom,
                  height: image.height * zoom,
                  transform: `translate(-50%, -50%) rotate(${image.rotation}rad)`,
                  border: isSelected ? "1px solid #60a5fa" : undefined,
                  touchAction: "none",
                }}
                onPointerDown={(event) => begin(event, image, "move")}
                onPointerMove={move}
                onPointerUp={finish}
                onPointerCancel={cancelDrag}
                onLostPointerCapture={cancelDrag}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  select(image);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    cancelDrag();
                    store.setState({ selectedReferenceImageId: null });
                  }
                  if (event.key === "Delete" || event.key === "Backspace") {
                    event.preventDefault();
                    event.stopPropagation();
                    remove(image);
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    select(image);
                  }
                }}
              >
                {isSelected && (
                  <>
                    {[0, 1, 2, 3].map((corner) => (
                      <button
                        key={corner}
                        aria-label={`Resize image corner ${corner + 1}`}
                        className="absolute h-3 w-3 border border-blue-400 bg-white"
                        style={{
                          left: corner === 1 || corner === 2 ? "100%" : 0,
                          top: corner >= 2 ? "100%" : 0,
                          transform: "translate(-50%, -50%)",
                          cursor: corner % 2 ? "nesw-resize" : "nwse-resize",
                        }}
                        onPointerDown={(event) => begin(event, image, corner)}
                      />
                    ))}
                    <button
                      aria-label="Rotate reference image"
                      className="absolute -top-8 left-1/2 h-4 w-4 -translate-x-1/2 cursor-grab rounded-full border border-blue-400 bg-white"
                      onPointerDown={(event) => begin(event, image, "rotate")}
                    />
                  </>
                )}
              </div>
            );
          })}
      {images.length > 0 && showUI && (
        <details
          className="pointer-events-auto absolute top-20 right-3 z-10 max-h-[70%] w-64 overflow-auto rounded-xl bg-screen p-3 text-sm shadow-sm"
          open={selected ? true : undefined}
        >
          <summary className="cursor-pointer font-bold">
            Reference images ({images.length})
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {images.map((image) => (
              <div key={image.id} className="flex items-center gap-1">
                <button
                  className={`min-w-0 flex-1 truncate text-left ${image.id === selectedId ? "font-bold text-blue-400" : ""}`}
                  title={image.name}
                  onClick={() => select(image)}
                >
                  {image.name}
                </button>
                <Button
                  size="sm"
                  onClick={() => update(image.id, { visible: !image.visible })}
                  aria-label={`${image.visible ? "Hide" : "Show"} ${image.name}`}
                >
                  {image.visible ? "Hide" : "Show"}
                </Button>
              </div>
            ))}
            {selected && (
              <div
                className="flex flex-col gap-2 border-t border-current/10 pt-2"
                onKeyDown={(event) => event.stopPropagation()}
              >
                <label className="flex items-center gap-2">
                  Opacity{" "}
                  <input
                    className="min-w-0 flex-1"
                    aria-label="Reference image opacity"
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(selected.opacity * 100)}
                    onChange={(event) =>
                      update(selected.id, {
                        opacity: Number(event.target.value) / 100,
                      })
                    }
                  />
                  <span>{Math.round(selected.opacity * 100)}%</span>
                </label>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    onClick={() =>
                      update(selected.id, { locked: !selected.locked })
                    }
                  >
                    {selected.locked ? "Unlock" : "Lock"}
                  </Button>
                  <Button size="sm" onClick={() => remove(selected)}>
                    Delete
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      store.setState({ selectedReferenceImageId: null })
                    }
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
