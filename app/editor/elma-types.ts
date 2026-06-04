import * as elmajs from "elmajs";

export const ElmaLevel = elmajs.Level;
export const ElmaLGR = elmajs.LGR;

export type ElmaLevel = InstanceType<typeof elmajs.Level>;
export type ElmaLGR = InstanceType<typeof elmajs.LGR>;

export enum ObjectType {
  Exit = 1,
  Apple = 2,
  Killer = 3,
  Start = 4,
}

export enum Gravity {
  None = 0,
  Up = 1,
  Down = 2,
  Left = 3,
  Right = 4,
}

export enum Clip {
  Unclipped = 0,
  Ground = 1,
  Sky = 2,
}

export type Position = InstanceType<typeof elmajs.Position>;
export type Polygon = InstanceType<typeof elmajs.Polygon>;
export type ElmaPicture = InstanceType<typeof elmajs.Picture>;

export type Picture = {
  name: string;
  texture: string;
  mask: Mask | "";
  position: Position;
  distance: number;
  clip: Clip;
};

export enum Texture {
  Brick = "brick",
  Ground = "ground",
  Sky = "sky",
  Stone1 = "stone1",
  Stone2 = "stone2",
  Stone3 = "stone3",
}

export enum Mask {
  Big = "maskbig",
  Horizontal = "maskhor",
  Litt = "masklitt",
  Top = "masktop",
}

export type AppleAnimation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type Apple = {
  position: Position;
  animation: AppleAnimation;
  gravity: Gravity;
};

export type EditorLevel = {
  levelName: string;
  lgr: string;
  ground: string;
  sky: string;
  polygons: Polygon[];
  apples: Apple[];
  killers: Position[];
  flowers: Position[];
  start: Position;
  pictures: Picture[];
};
