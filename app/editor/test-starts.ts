import type { Position } from "./elma-types";
import type { EditorState } from "./editor-state";
export type TestStart = {
  id: string;
  name: string;
  position: Position;
  color: string;
  ride?: import("./play-mode/engine/game/ride-history").RideMoment;
};
export type TestStartSession = {
  items: TestStart[];
  activeId: string | null;
  nextNumber: number;
  levelColor: string;
  levelName: string;
};
export const emptyTestStarts = (): TestStartSession => ({
  items: [],
  activeId: null,
  nextNumber: 1,
  levelColor: "#ffffff",
  levelName: "Level start",
});
export const testStartColors = [
  "#ffff66", // Yellow
  "#ff70e5", // Pink
  "#66ffff", // Cyan
  "#ffad55", // Orange
  "#a0ff66", // Lime
  "#c299ff", // Violet
  "#ff7777", // Coral
  "#77adff", // Blue
];
// Keep inactive starts recognizably ghosted, especially while riding past them.
export const testStartGhostOpacity = { editor: 0.6, play: 0.32 };
export function activeTestStart(
  state: Pick<EditorState, "start" | "testStarts">,
) {
  return (
    state.testStarts.items.find(
      (item) => item.id === state.testStarts.activeId,
    ) ?? {
      id: null,
      name: state.testStarts.levelName,
      position: state.start,
      color: state.testStarts.levelColor,
      ride: undefined,
    }
  );
}
