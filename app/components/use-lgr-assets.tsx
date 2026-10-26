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
import { listLgrFiles, loadLgrFolder, saveLgrFolder } from "./lgr-folder";
import type { AppleAnimation } from "~/editor/elma-types";

const DEFAULT_APPLE_ANIMATIONS: AppleAnimation[] = [1, 2];
const DEFAULT_LGR_OPTION: LgrOption = {
  name: "Default.lgr",
  levelName: "default",
};
export type LgrOption = { name: string; levelName: string };

type LgrContextType = {
  lgr: LgrAssets;
  currentLgrData: ArrayBuffer | null;
  lgrOptions: LgrOption[];
  error?: string;
  status?: string;
  isLoaded: boolean;
  folderName?: string;
  folderNeedsAccess: boolean;
  folderError?: string;
  pickFolder: () => Promise<void>;
  reconnectFolder: () => Promise<void>;
  forgetFolder: () => Promise<void>;
  loadLgrFile: (file: File) => Promise<{ levelName: string } | null>;
  selectLgr: (levelName: string) => Promise<boolean>;
};

const LgrContext = createContext<LgrContextType | null>(null);

export function LgrAssetsProvider({ children }: { children: React.ReactNode }) {
  const [lgr, setLgr] = useState(() => new LgrAssets());
  const activeLgr = useRef(lgr);
  const activeData = useRef<ArrayBuffer | null>(null);
  const [currentLgrData, setCurrentLgrData] = useState<ArrayBuffer | null>(
    null,
  );
  const [storedOptions, setStoredOptions] = useState<LgrOption[]>([]);
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderFiles, setFolderFiles] = useState<FileSystemFileHandle[]>([]);
  const [folderNeedsAccess, setFolderNeedsAccess] = useState(false);
  const [folderError, setFolderError] = useState<string>();
  const [initialized, setInitialized] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [revision, setRevision] = useState(0);
  const requestId = useRef(0);
  const lastRequest = useRef<{ key: string; promise: Promise<boolean> } | null>(
    null,
  );

  useEffect(function cancelPendingLgrRequestsOnUnmount() {
    const requests = requestId;
    return function cancelPendingLgrRequests() {
      ++requests.current;
    };
  }, []);

  useEffect(function restoreLgrSources() {
    let cancelled = false;
    async function restore() {
      // Storage failure must not prevent the bundled default from working.
      const [stored, savedFolder] = await Promise.allSettled([
        loadStoredLgrs(),
        loadLgrFolder(),
      ]);
      if (cancelled) return;
      if (stored.status === "fulfilled")
        setStoredOptions(toLgrOptions(stored.value));
      if (savedFolder.status === "fulfilled" && savedFolder.value) {
        const handle = savedFolder.value;
        try {
          const granted =
            (await handle.queryPermission({ mode: "read" })) === "granted";
          const files = granted ? await listLgrFiles(handle) : [];
          if (cancelled) return;
          setFolder(handle);
          setFolderFiles(files);
          setFolderNeedsAccess(!granted);
        } catch {
          if (cancelled) return;
          setFolder(handle);
          setFolderNeedsAccess(true);
        }
      }
      if (!cancelled) setInitialized(true);
    }
    void restore();
    return function cancelRestore() {
      cancelled = true;
    };
  }, []);

  useEffect(
    function disposeLgr() {
      return function destroyLgr() {
        lgr.destroy();
      };
    },
    [lgr],
  );

  const selectLgr = useCallback(
    (levelName: string): Promise<boolean> => {
      if (!initialized) return Promise.resolve(false);
      const name = getLevelLgrName(levelName);
      const key = `${revision}:${normalizeLevelLgrName(name)}`;
      if (lastRequest.current?.key === key) return lastRequest.current.promise;
      const id = ++requestId.current;
      const promise = (async () => {
        let next: LgrAssets | undefined;
        let data: ArrayBuffer | null = null;
        let message: string | undefined;
        try {
          const entry = folderFiles.find((f) =>
            isSameLevelLgrName(f.name, name),
          );
          if (entry) {
            try {
              data = await (await entry.getFile()).arrayBuffer();
              next = new LgrAssets(entry.name, name);
              await next.loadFromBytes(data.slice(0));
            } catch (cause) {
              console.error("Could not load folder LGR", cause);
              if (
                id === requestId.current &&
                cause instanceof DOMException &&
                cause.name === "NotAllowedError"
              ) {
                setFolderNeedsAccess(true);
              }
              next?.destroy();
              next = undefined;
              data = null;
            }
          }

          if (!next) {
            const stored = await loadStoredLgr(name).catch(() => null);
            if (stored) {
              data = stored.data.slice(0);
              next = new LgrAssets(stored.name, name);
              await next.loadFromBytes(data.slice(0));
            }
          }

          if (!next) {
            if (!isSameLevelLgrName(name, "default")) {
              message = `${name}.lgr unavailable. Preview uses bundled Default.lgr.`;
            }
            next =
              activeLgr.current.levelName === "default" && !activeData.current
                ? activeLgr.current
                : new LgrAssets();
            await next.load();
          }
        } catch (cause) {
          console.error("Could not load LGR", cause);
          if (
            id === requestId.current &&
            cause instanceof DOMException &&
            cause.name === "NotAllowedError"
          ) {
            setFolderNeedsAccess(true);
          }
          if (next && next !== activeLgr.current) next.destroy();
          message = `Could not load ${name}.lgr. Preview uses bundled Default.lgr.`;
          data = null;
          next = new LgrAssets();
          try {
            await next.load();
          } catch {
            next.destroy();
            if (id === requestId.current) {
              setError("Could not load LGR graphics.");
              setIsLoaded(false);
            }
            return false;
          }
        }
        if (id !== requestId.current) {
          if (next !== activeLgr.current) next.destroy();
          return false;
        }
        activeLgr.current = next;
        activeData.current = data;
        setLgr(next);
        setCurrentLgrData(data);
        setStatus(message);
        setError(undefined);
        setIsLoaded(true);
        return !message;
      })();
      lastRequest.current = { key, promise };
      return promise;
    },
    [initialized, folderFiles, revision],
  );

  async function updateFolder(handle: FileSystemDirectoryHandle) {
    const files = await listLgrFiles(handle);
    await saveLgrFolder(handle);
    ++requestId.current;
    setFolder(handle);
    setFolderFiles(files);
    setFolderNeedsAccess(false);
    setFolderError(undefined);
    setRevision((r) => r + 1);
  }

  async function pickFolder() {
    try {
      const handle = await window.showDirectoryPicker({
        id: "elma-lgr-folder",
        mode: "read",
      });
      await updateFolder(handle);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setFolderError("Could not read that LGR folder.");
    }
  }

  async function reconnectFolder() {
    if (!folder) return;
    try {
      if ((await folder.requestPermission({ mode: "read" })) !== "granted") {
        setFolderError("Allow read access to use this LGR folder.");
        return;
      }
      await updateFolder(folder);
    } catch {
      setFolderError("Could not read that LGR folder. Choose it again.");
    }
  }

  async function forgetFolder() {
    try {
      await saveLgrFolder(null);
      ++requestId.current;
      setFolder(null);
      setFolderFiles([]);
      setFolderNeedsAccess(false);
      setFolderError(undefined);
      setRevision((r) => r + 1);
    } catch {
      setFolderError("Could not forget the LGR folder.");
    }
  }

  async function loadLgrFile(file: File) {
    if (!/\.lgr$/i.test(file.name)) {
      setError("Choose a .lgr file.");
      return null;
    }
    const levelName = getLevelLgrName(file.name);
    const next = new LgrAssets(file.name, levelName);
    try {
      const data = await file.arrayBuffer();
      await next.loadFromBytes(data.slice(0));
      await saveStoredLgr({ name: file.name, levelName, data });
      next.destroy();
      setStoredOptions((options) =>
        upsertLgrOption(options, { name: file.name, levelName }),
      );
      setError(undefined);
      setRevision((r) => r + 1);
      return { levelName };
    } catch {
      next.destroy();
      setError("Could not import that LGR file.");
      return null;
    }
  }

  const lgrOptions = [
    DEFAULT_LGR_OPTION,
    ...toLgrOptions([
      ...storedOptions,
      ...folderFiles.map((f) => ({
        name: f.name,
        levelName: getLevelLgrName(f.name),
      })),
    ]),
  ];

  return (
    <LgrContext.Provider
      value={{
        lgr,
        currentLgrData,
        lgrOptions,
        isLoaded,
        error,
        status,
        folderName: folder?.name,
        folderNeedsAccess,
        folderError,
        pickFolder,
        reconnectFolder,
        forgetFolder,
        loadLgrFile,
        selectLgr,
      }}
    >
      {children}
    </LgrContext.Provider>
  );
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
