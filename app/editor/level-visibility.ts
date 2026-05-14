export type LevelVisibilitySettings = {
  useGroundSkyTextures: boolean;
  zoomTextures: boolean;
  showObjectAnimations: boolean;
  showPolygonHandles: boolean;
  showObjectBounds: boolean;
  showPolygonBounds: boolean;
  showPictureBounds: boolean;
  showTextureBounds: boolean;
  showObjects: boolean;
  showPictures: boolean;
  showTextures: boolean;
  showPolygons: boolean;
};

export const defaultLevelVisibility: LevelVisibilitySettings = {
  useGroundSkyTextures: false,
  zoomTextures: true,
  showObjectAnimations: true,
  showPolygonHandles: false,
  showObjectBounds: false,
  showPolygonBounds: false,
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
