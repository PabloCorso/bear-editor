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

export type Position = { x: number; y: number };
export type Polygon = { grass: boolean; vertices: Position[] };
export type LevelObject = {
  type: ObjectType;
  position: Position;
  gravity: Gravity;
  animation: number;
};

export type Picture = {
  name: string;
  texture: string;
  mask: string;
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

export type TimeEntry = { name1: string; name2: string; time: number };
export type LevelTop10 = { single: TimeEntry[]; multi: TimeEntry[] };

export type EditorLevel = {
  top10?: LevelTop10;
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
