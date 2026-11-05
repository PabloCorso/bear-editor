import { useEffect, useMemo, useState } from "react";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { IconButton } from "~/components/ui/button";
import { useEditor, useEditorActions } from "~/editor/use-editor-store";
import { calculateBoundingBox } from "~/editor/helpers/level-helpers";

const WIDTH = 192;
const HEIGHT = 120;
const PADDING = 10;

export function CanvasMinimap({
  canvasRef,
  onClose,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onClose: () => void;
}) {
  const polygons = useEditor((state) => state.polygons);
  const apples = useEditor((state) => state.apples);
  const killers = useEditor((state) => state.killers);
  const flowers = useEditor((state) => state.flowers);
  const start = useEditor((state) => state.start);
  const zoom = useEditor((state) => state.zoom);
  const offset = useEditor((state) => state.viewPortOffset);
  const { setCamera } = useEditorActions();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () =>
      setViewport({ width: canvas.clientWidth, height: canvas.clientHeight });
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef]);

  // Keep the map anchored to level content while the camera moves.
  const map = useMemo(() => {
    const bounds = calculateBoundingBox({
      polygons,
      apples,
      killers,
      flowers,
      start,
    });
    const minX = Number.isFinite(bounds.minX) ? bounds.minX : 0;
    const minY = Number.isFinite(bounds.minY) ? bounds.minY : 0;
    const width = Math.max(1, bounds.maxX - minX || 1);
    const height = Math.max(1, bounds.maxY - minY || 1);
    const scale = Math.min(
      (WIDTH - PADDING * 2) / width,
      (HEIGHT - PADDING * 2) / height,
    );
    const x = WIDTH / 2 - (minX + width / 2) * scale;
    const y = HEIGHT / 2 - (minY + height / 2) * scale;
    const point = (p: { x: number; y: number }) => ({
      x: p.x * scale + x,
      y: p.y * scale + y,
    });
    return {
      scale,
      x,
      y,
      point,
      paths: polygons.map(
        (polygon) =>
          polygon.vertices
            .map((vertex, index) => {
              const p = point(vertex);
              return `${index ? "L" : "M"}${p.x},${p.y}`;
            })
            .join(" ") + " Z",
      ),
    };
  }, [polygons, apples, killers, flowers, start]);

  return (
    <div className="absolute right-0 bottom-full mb-2 overflow-hidden rounded-xl border border-default bg-screen shadow-sm">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs text-secondary">Minimap</span>
        <IconButton
          size="sm"
          className="size-6"
          aria-label="Close minimap"
          onClick={onClose}
        >
          <XIcon />
        </IconButton>
      </div>
      <button
        type="button"
        className="block cursor-crosshair focus-visible:outline-2 focus-visible:outline-white"
        aria-label="Navigate level using minimap"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          // Keyboard activation centers the view on the level.
          const x =
            event.detail === 0
              ? WIDTH / 2
              : ((event.clientX - rect.left) * WIDTH) / rect.width;
          const y =
            event.detail === 0
              ? HEIGHT / 2
              : ((event.clientY - rect.top) * HEIGHT) / rect.height;
          setCamera(
            viewport.width / 2 - ((x - map.x) / map.scale) * zoom,
            viewport.height / 2 - ((y - map.y) / map.scale) * zoom,
          );
        }}
      >
        <svg
          width={WIDTH}
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          aria-hidden="true"
        >
          <g
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.6}
            strokeWidth={1}
          >
            {map.paths.map((path, index) => (
              <path key={index} d={path} />
            ))}
          </g>
          {apples.map((apple, index) => (
            <circle
              key={index}
              {...circleAt(map.point(apple.position))}
              fill="#f87171"
            />
          ))}
          {killers.map((position, index) => (
            <circle
              key={index}
              {...circleAt(map.point(position))}
              fill="#a1a1aa"
            />
          ))}
          {flowers.map((position, index) => (
            <circle
              key={index}
              {...circleAt(map.point(position))}
              fill="#facc15"
            />
          ))}
          <circle {...circleAt(map.point(start))} fill="#4ade80" />
          <rect
            x={(-offset.x / zoom) * map.scale + map.x}
            y={(-offset.y / zoom) * map.scale + map.y}
            width={(viewport.width / zoom) * map.scale}
            height={(viewport.height / zoom) * map.scale}
            fill="white"
            fillOpacity={0.08}
            stroke="white"
            strokeWidth={1.5}
          />
        </svg>
      </button>
    </div>
  );
}

function circleAt(point: { x: number; y: number }) {
  return { cx: point.x, cy: point.y, r: 2 };
}
