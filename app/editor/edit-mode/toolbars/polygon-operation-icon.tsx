import type { ComponentPropsWithoutRef } from "react";
import { colors, uiColors } from "~/editor/constants";
import type { PolygonOperation } from "~/editor/helpers/polygon-boolean";

const paths = {
  union: "M3 3H15V9H21V21H9V15H3Z",
  subtract: "M3 3H15V9H9V15H3Z",
  exclude: "M3 3H15V9H9V15H3Z M15 9H21V21H9V15H15Z",
  intersect: "M9 9H15V15H9Z",
};

export function PolygonOperationIcon({
  operation,
  ...props
}: ComponentPropsWithoutRef<"svg"> & { operation: PolygonOperation }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect width="24" height="24" rx="4" fill={colors.sky} />
      <path
        d="M3 3H15V15H3Z M9 9H21V21H9Z"
        stroke={uiColors.vertexDraftLine}
        strokeWidth="1"
        opacity="0.6"
      />
      <path
        d={paths[operation]}
        fill={colors.ground}
        stroke={uiColors.vertexDraftLine}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
