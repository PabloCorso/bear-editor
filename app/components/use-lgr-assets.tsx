import { useEffect, useContext, createContext, useMemo, useState } from "react";
import { LgrAssets } from "./lgr-assets";
import { standardSprites } from "./standard-sprites";

type LgrContextType = { lgr: LgrAssets | null; isLoaded: boolean };

const LgrContext = createContext<LgrContextType | null>(null);

export function LgrAssetsProvider({ children }: { children: React.ReactNode }) {
  const lgrLoader = useMemo(() => new LgrAssets(), []);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(
    function kickOffLgrLoading() {
      lgrLoader.load().then(() => {
        setIsLoaded(true);
      });

      return function cleanupLgrLoader() {
        lgrLoader.destroy();
      };
    },
    [lgrLoader],
  );

  const value = useMemo(
    () => ({ lgr: lgrLoader, isLoaded }),
    [lgrLoader, isLoaded],
  );

  return <LgrContext.Provider value={value}>{children}</LgrContext.Provider>;
}

export function useLgrAssets() {
  const context = useContext(LgrContext);
  if (!context) {
    throw new Error("useLgrAssets must be used within LgrAssetsProvider");
  }

  return context;
}

export function useLgrSprite(name: string) {
  const lgrAssets = useLgrAssets();
  return useMemo(
    () => ({
      src: lgrAssets.lgr?.getSpritePreview(name),
      width: lgrAssets.lgr?.getSprite(name)?.width,
      height: lgrAssets.lgr?.getSprite(name)?.height,
    }),
    [name, lgrAssets.lgr, lgrAssets.isLoaded],
  );
}

export function usePictureSprites() {
  const lgrAssets = useLgrAssets();
  return useMemo(() => {
    const pictureSprites = lgrAssets.lgr?.getPictureSprites() ?? [];
    return pictureSprites.map(({ picture, sprite, src }) => ({
      picture,
      src,
      width: sprite?.width,
      height: sprite?.height,
    }));
  }, [lgrAssets.lgr, lgrAssets.isLoaded]);
}

export function useTextureSprites() {
  const lgrAssets = useLgrAssets();
  return useMemo(() => {
    const textureSprites = lgrAssets.lgr?.getTextureSprites() ?? [];
    return textureSprites.map(({ texture, sprite }) => {
      return {
        texture,
        src: lgrAssets.lgr?.getSpritePreview(texture.texture),
        maskedSrc: lgrAssets.lgr?.getMaskedTexturePreview(
          texture.texture,
          texture.mask,
        ),
        width: sprite?.width,
        height: sprite?.height,
      };
    });
  }, [lgrAssets.lgr, lgrAssets.isLoaded]);
}

export function useTextureMaskSprites() {
  const lgrAssets = useLgrAssets();
  return useMemo(() => {
    const textureSprites = lgrAssets.lgr?.getTextureSprites() ?? [];
    return standardSprites.textureMasks.flatMap((mask) =>
      textureSprites.map(({ texture, sprite }) => ({
        texture,
        mask,
        src: lgrAssets.lgr?.getSpritePreview(texture.texture),
        maskedSrc: lgrAssets.lgr?.getMaskedTexturePreview(
          texture.texture,
          mask,
        ),
        width: sprite?.width,
        height: sprite?.height,
      })),
    );
  }, [lgrAssets.lgr, lgrAssets.isLoaded]);
}
