export type LevelVisibilitySettings = {
  useGroundSkyTextures: boolean;
  useGrassTextures: boolean;
  zoomTextures: boolean;
  showObjectAnimations: boolean;
  showPolygonHandles: boolean;
  showObjectBounds: boolean;
  showGroundBounds: boolean;
  showGrassBounds: boolean;
  showPictureBounds: boolean;
  showTextureBounds: boolean;
  showObjects: boolean;
  showPictures: boolean;
  showTextures: boolean;
  showPolygons: boolean;
};

export const defaultLevelVisibility: LevelVisibilitySettings = {
  useGroundSkyTextures: false,
  useGrassTextures: false,
  zoomTextures: true,
  showObjectAnimations: false,
  showPolygonHandles: false,
  showObjectBounds: false,
  showGroundBounds: true,
  showGrassBounds: true,
  showPictureBounds: false,
  showTextureBounds: false,
  showObjects: true,
  showPictures: true,
  showTextures: true,
  showPolygons: true,
};

export function isDefaultLevelVisibility(
  levelVisibility: LevelVisibilitySettings,
) {
  const visibilityKeys = Object.keys(defaultLevelVisibility) as Array<
    keyof LevelVisibilitySettings
  >;

  return visibilityKeys.every(
    (key) => levelVisibility[key] === defaultLevelVisibility[key],
  );
}
