import type { SelectTool } from "../tools/select-tool";
import { CanvasTipSegment } from "./canvas-tip";

const truncateMeasurement = (value: number) => Math.trunc(value);

export function TransformMeasurements({
  tool,
}: {
  tool: SelectTool | undefined;
}) {
  const values = tool?.getTransformMeasurements();
  if (!values) return null;

  return (
    <>
      <CanvasTipSegment className="tabular-nums">
        Width {truncateMeasurement(values.width)} (
        {truncateMeasurement(values.scaleX)}%)
      </CanvasTipSegment>
      <CanvasTipSegment className="tabular-nums">
        Height {truncateMeasurement(values.height)} (
        {truncateMeasurement(values.scaleY)}%)
      </CanvasTipSegment>
      <CanvasTipSegment className="tabular-nums">
        Angle {truncateMeasurement(values.angle)}°
      </CanvasTipSegment>
    </>
  );
}
