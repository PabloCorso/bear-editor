import { useEditor, useEditorToolState } from "~/editor/use-editor-store";
import { worldToScreen } from "~/editor/helpers/coordinate-helpers";
import {
  measurementValues,
  type Measurement,
  type MeasureToolState,
} from "./tools/measure-tool";

const format = (value: number) => value.toFixed(2);

// SVG keeps labels and angle arcs readable at every zoom without adding text
// rendering to the world renderer. It never receives canvas pointer events.
export function MeasureOverlay() {
  const active = useEditor(
    (s) => s.activeToolId === "measure" && !s.isPlayMode,
  );
  const mouseOnCanvas = useEditor((s) => s.mouseOnCanvas);
  const zoom = useEditor((s) => s.zoom);
  const offset = useEditor((s) => s.viewPortOffset);
  const tool = useEditorToolState<MeasureToolState>("measure");
  if (!active || !tool) return null;
  const preview = tool.anchor || mouseOnCanvas ? tool.preview : undefined;
  const measurements = (tool.measurements ?? []).filter(
    (m) => m.id !== tool.editingId,
  );
  if (preview) measurements.push(preview);
  const activeId = tool.hoveredId ?? tool.selectedId;
  const screen = (point: { x: number; y: number }) =>
    worldToScreen(point, offset, zoom);

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden select-none"
      aria-label="Measurements"
      role="img"
    >
      {measurements.map((m) => (
        <Ruler
          key={m.id}
          measurement={m}
          from={screen(m.from)}
          to={screen(m.to)}
          active={m === preview || (m.id === activeId && !tool.anchor)}
          preview={m === preview}
        />
      ))}
      {tool.snappedPoint && mouseOnCanvas && (
        <circle
          cx={screen(tool.snappedPoint).x}
          cy={screen(tool.snappedPoint).y}
          r={6}
          fill="none"
          stroke="#67e8f9"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}

function Ruler({
  measurement,
  from,
  to,
  active,
  preview,
}: {
  measurement: Measurement;
  from: { x: number; y: number };
  to: { x: number; y: number };
  active: boolean;
  preview: boolean;
}) {
  const values = measurementValues(measurement);
  if (values.length < 1e-8) {
    return (
      <circle
        cx={from.x}
        cy={from.y}
        r={4}
        fill="#0f172a"
        stroke="#67e8f9"
        strokeWidth={1.5}
      />
    );
  }
  const color = active ? "#67e8f9" : "#e2e8f0";
  // Always reference the endpoint on the left, so endpoint order never changes
  // the slope. Screen Y increases downward, including for the signed SVG arc.
  const start = from.x <= to.x ? from : to;
  const end = start === from ? to : from;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const radius = Math.min(30, Math.hypot(to.x - from.x, to.y - from.y) * 0.35);
  const arcEnd = {
    x: start.x + radius * Math.cos(angle),
    y: start.y + radius * Math.sin(angle),
  };
  const lines = active
    ? [
        `${format(values.length)} units`,
        `${values.horizontalAngle.toFixed(1)}° horizontal · ${values.verticalAngle.toFixed(1)}° vertical`,
        `Width ${format(values.width)} · Height ${format(values.height)}`,
      ]
    : [
        `${format(values.length)} units · ${values.horizontalAngle.toFixed(1)}°`,
      ];
  const labelWidth = Math.max(...lines.map((l) => l.length)) * 6.5 + 16;
  const labelHeight = lines.length * 17 + 10;
  const labelX = (from.x + to.x) / 2;
  const labelY = (from.y + to.y) / 2 - 16;
  return (
    <g>
      <title>{`Length ${format(values.length)} level units, ${values.horizontalAngle.toFixed(1)} degrees from horizontal, width ${format(values.width)}, height ${format(values.height)}`}</title>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="#0f172a"
        strokeWidth={4}
        opacity={0.8}
      />
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={preview ? "5 4" : undefined}
      />
      {[from, to].map((point, i) => (
        <circle
          key={i}
          cx={point.x}
          cy={point.y}
          r={active ? 4 : 3}
          fill="#0f172a"
          stroke={color}
          strokeWidth={1.5}
        />
      ))}
      {active && radius > 3 && (
        <g stroke={color} strokeWidth={1} fill="none">
          <line
            x1={start.x}
            y1={start.y}
            x2={start.x + Math.max(42, radius + 8)}
            y2={start.y}
            strokeDasharray="3 3"
          />
          {Math.abs(angle) > 0.001 && (
            <path
              d={`M ${start.x + radius} ${start.y} A ${radius} ${radius} 0 0 ${angle >= 0 ? 1 : 0} ${arcEnd.x} ${arcEnd.y}`}
            />
          )}
        </g>
      )}
      <g transform={`translate(${labelX}, ${labelY})`}>
        <rect
          x={-labelWidth / 2}
          y={-labelHeight}
          width={labelWidth}
          height={labelHeight}
          rx={5}
          fill="#0f172a"
          fillOpacity={0.94}
          stroke={color}
          strokeOpacity={0.5}
        />
        <text
          fill={color}
          textAnchor="middle"
          fontSize={11}
          fontFamily="Inter, sans-serif"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {lines.map((line, i) => (
            <tspan key={i} x={0} y={-labelHeight + 17 + i * 17}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    </g>
  );
}
