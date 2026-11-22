import type {
  Apple,
  EditorLevel,
  Picture,
  Position,
} from "~/editor/elma-types";

export type Demo = {
  initial: EditorLevel;
  target: EditorLevel;
  commands: DemoCommand[];
};

export type DemoCommand =
  | { type: "polygon"; vertices: Position[] }
  | { type: "moveStart"; to: Position }
  | { type: "moveFlower"; index: number; to: Position }
  | { type: "apple"; apple: Apple }
  | { type: "autoGrass" }
  | { type: "picture"; picture: Picture }
  | { type: "title"; title: string }
  | { type: "preview" }
  | { type: "playtest"; duration: number }
  | { type: "wait"; duration: number };
