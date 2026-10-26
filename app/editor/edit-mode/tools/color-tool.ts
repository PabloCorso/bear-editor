import { defaultTools, type ToolMeta } from "./default-tools";
import { PictureTool, type PictureToolState } from "./picture-tool";

export type ColorToolState = PictureToolState;

// Color entries place fixed-size ordinary pictures, including their clipping
// and distance. Keeping a separate tool state preserves the Pictures selection.
export class ColorTool extends PictureTool {
  readonly meta: ToolMeta = defaultTools.color;

  onActivate() {
    // The color list supplies a selection; an empty LGR places nothing.
  }
}
