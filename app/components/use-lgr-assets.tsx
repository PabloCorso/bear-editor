import {
  useCallback,
  useEffect,
  useContext,
  createContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { LgrAssets } from "./lgr-assets";
import { loadStoredLgr, loadStoredLgrs, saveStoredLgr } from "./lgr-storage";
import type { AppleAnimation } from "~/editor/elma-types";

const DEFAULT_APPLE_ANIMATIONS: AppleAnimation[] = [1, 2];
const DEFAULT_LGR_OPTION: LgrOption = {
  name: "Default.lgr",
  levelName: "default",
};

export type LgrOption = {
  name: string;
  levelName: string;
};

type LgrContextType = {
  lgr: LgrAssets | null;
  currentLgrData: ArrayBuffer | null;
  lgrOptions: LgrOption[];
  error?: string;
  isLoaded: boolean;
  loadCachedLgr: (levelName: string) => Promise<boolean>;
  loadLgrFile: (file: File) => Promise<{ levelName: string } | null>;
  selectLgr: (levelName: string) => Promise<boolean>;
};

const LgrContext = createContext<LgrContextType | null>(null);

export function LgrAssetsProvider({ children }: { children: React.ReactNode }) {
  const [lgrLoader, setLgrLoader] = useState<LgrAssets | null>(null);
  const [currentLgrData, setCurrentLgrData] = useState<ArrayBuffer | null>(
    null,
  );
  const [storedLgrOptions, setStoredLgrOptions] = useState<LgrOption[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const lgrRequestIdRef = useRef(0);

  useEffect(function kickOffLgrLoading() {
    let cancelled = false;
    let lgr = new LgrAssets();
    let activated = false;

    async function loadInitialLgr() {
      try {
        await lgr.load();
        const storedLgrs = await loadStoredLgrs();
        if (cancelled) return;
        setStoredLgrOptions(toLgrOptions(storedLgrs));

        if (cancelled) return;
        activated = true;
        setLgrLoader(lgr);
        setIsLoaded(true);
        setError(undefined);
      } catch (loadError) {
        console.error("Failed to load LGR:", loadError);
        if (cancelled) return;
        setError("Failed to load LGR.");
        lgr.destroy();
        lgr = new LgrAssets();
        await lgr.load();
        if (cancelled) return;
        activated = true;
        setLgrLoader(lgr);
        setIsLoaded(true);
      }
    }

    void loadInitialLgr();

    return function cleanupLgrLoader() {
      cancelled = true;
      if (!activated) lgr.destroy();
    };
  }, []);

  useEffect(
    function cleanupActiveLgr() {
      return function destroyActiveLgr() {
        lgrLoader?.destroy();
      };
    },
    [lgrLoader],
  );

  const loadCachedLgr = useCallback(
    async (levelName: string) => {
      const normalizedLevelName = getLevelLgrName(levelName);
      if (
        isSameLevelLgrName(normalizedLevelName, "default") ||
        isSameLevelLgrName(lgrLoader?.levelName, normalizedLevelName)
      ) {
        return false;
      }

      const requestId = ++lgrRequestIdRef.current;
      const storedLgr = await loadStoredLgr(normalizedLevelName);
      if (!storedLgr) return false;

      const nextLgr = new LgrAssets(storedLgr.name, storedLgr.levelName);
      try {
        await nextLgr.loadFromBytes(storedLgr.data.slice(0));
      } catch (loadError) {
        console.error("Failed to load cached LGR:", loadError);
        nextLgr.destroy();
        if (requestId !== lgrRequestIdRef.current) return false;
        setError("Could not load cached LGR.");
        return false;
      }

      if (requestId !== lgrRequestIdRef.current) {
        nextLgr.destroy();
        return false;
      }

      setLgrLoader(nextLgr);
      setCurrentLgrData(storedLgr.data.slice(0));
      setIsLoaded(true);
      setError(undefined);
      return true;
    },
    [lgrLoader?.levelName],
  );

  const selectLgr = useCallback(
    async (levelName: string) => {
      const normalizedLevelName = getLevelLgrName(levelName);
      if (isSameLevelLgrName(normalizedLevelName, "default")) {
        if (isSameLevelLgrName(lgrLoader?.levelName, "default")) {
          return false;
        }

        const requestId = ++lgrRequestIdRef.current;
        const nextLgr = new LgrAssets();
        await nextLgr.load();
        if (requestId !== lgrRequestIdRef.current) {
          nextLgr.destroy();
          return false;
        }

        setLgrLoader(nextLgr);
        setCurrentLgrData(null);
        setIsLoaded(true);
        setError(undefined);
        return true;
      }

      return loadCachedLgr(normalizedLevelName);
    },
    [lgrLoader?.levelName, loadCachedLgr],
  );

  const loadLgrFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".lgr")) {
      setError("Choose a .lgr file.");
      return null;
    }

    const data = await file.arrayBuffer();
    const levelName = getLevelLgrName(file.name);
    const requestId = ++lgrRequestIdRef.current;
    const nextLgr = new LgrAssets(file.name, levelName);

    try {
      await nextLgr.loadFromBytes(data.slice(0));
    } catch (loadError) {
      console.error("Failed to load LGR:", loadError);
      nextLgr.destroy();
      if (requestId !== lgrRequestIdRef.current) return null;
      setError("Could not load that LGR file.");
      return null;
    }

    if (requestId !== lgrRequestIdRef.current) {
      nextLgr.destroy();
      return null;
    }

    await saveStoredLgr({
      name: file.name,
      levelName,
      data: data.slice(0),
    });
    setStoredLgrOptions((options) =>
      upsertLgrOption(options, { name: file.name, levelName }),
    );
    setLgrLoader(nextLgr);
    setCurrentLgrData(data.slice(0));
    setIsLoaded(true);
    setError(undefined);
    return { levelName };
  }, []);

  const lgrOptions = useMemo(
    () => [DEFAULT_LGR_OPTION, ...storedLgrOptions],
    [storedLgrOptions],
  );

  const value = useMemo(
    () => ({
      lgr: lgrLoader,
      currentLgrData,
      lgrOptions,
      error,
      isLoaded,
      loadCachedLgr,
      loadLgrFile,
      selectLgr,
    }),
    [
      currentLgrData,
      error,
      isLoaded,
      lgrOptions,
      lgrLoader,
      loadCachedLgr,
      loadLgrFile,
      selectLgr,
    ],
  );

  return <LgrContext.Provider value={value}>{children}</LgrContext.Provider>;
}

export function getLevelLgrName(name: string) {
  return (
    name
      .trim()
      .replace(/\.lgr$/i, "")
      .slice(0, 16) || "default"
  );
}

export function isSameLevelLgrName(left?: string, right?: string) {
  return normalizeLevelLgrName(left) === normalizeLevelLgrName(right);
}

function normalizeLevelLgrName(name?: string) {
  return getLevelLgrName(name ?? "default").toLowerCase();
}

function toLgrOptions(lgrs: LgrOption[]) {
  const options = new Map<string, LgrOption>();
  for (const lgr of lgrs) {
    if (isSameLevelLgrName(lgr.levelName, "default")) continue;
    options.set(normalizeLevelLgrName(lgr.levelName), lgr);
  }

  return Array.from(options.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function upsertLgrOption(options: LgrOption[], option: LgrOption) {
  return toLgrOptions([...options, option]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, lgrAssets.lgr, lgrAssets.isLoaded],
  );
}

export function useAppleSprites() {
  const lgrAssets = useLgrAssets();
  return useMemo(() => {
    const animations =
      lgrAssets.lgr?.getAppleAnimationOptions() ?? DEFAULT_APPLE_ANIMATIONS;
    const visibleAnimations =
      animations.length > 2 ? animations : DEFAULT_APPLE_ANIMATIONS;
    return visibleAnimations.map((animation) => ({
      animation,
      src: lgrAssets.lgr?.getAppleSpritePreview(animation),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lgrAssets.lgr, lgrAssets.isLoaded]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lgrAssets.lgr, lgrAssets.isLoaded]);
}

export function useTextureMaskSprites() {
  const lgrAssets = useLgrAssets();
  return useMemo(() => {
    const textureSprites = lgrAssets.lgr?.getTextureMaskSprites() ?? [];
    return textureSprites.map(
      ({ texture, mask, maskSprite, src, maskedSrc }) => ({
        texture,
        mask,
        src,
        maskedSrc,
        width: maskSprite?.width,
        height: maskSprite?.height,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lgrAssets.lgr, lgrAssets.isLoaded]);
}
