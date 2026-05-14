import { useEffect, useRef } from "react";
import type { EditorState } from "~/editor/editor-state";
import { defaultLevelVisibility } from "~/editor/level-visibility";
import { defaultPlaySettings } from "~/editor/play-mode/play-settings";
import { useEditorStore } from "~/editor/use-editor-store";

type LegacyLocalStoragePlaySettings = {
  deathBehavior?: "stop" | "reset";
} & Partial<EditorState["playSettings"]>;

type LocalStorageLevel = Pick<
  EditorState,
  | "levelName"
  | "ground"
  | "sky"
  | "polygons"
  | "apples"
  | "killers"
  | "flowers"
  | "start"
  | "pictures"
  | "activeToolId"
  | "animateSprites"
  | "showSprites"
  | "viewPortOffset"
  | "zoom"
  | "levelVisibility"
> & {
  playSettings?: LegacyLocalStoragePlaySettings;
};

export function useLocalStorageSync(key = "elma-web-store") {
  const isInitializedRef = useRef(false);
  const store = useEditorStore();

  // Load from localStorage on mount (only once)
  useEffect(() => {
    if (isInitializedRef.current) return;

    const item = localStorage.getItem(key);
    if (item) {
      try {
        const savedData = JSON.parse(item) as LocalStorageLevel;

        // Import the level data into the store
        const state = store.getState();
        state.actions.replaceDocument({
          level: {
            levelName: savedData.levelName,
            ground: savedData.ground ?? "ground",
            sky: savedData.sky ?? "sky",
            polygons: savedData.polygons,
            apples: savedData.apples,
            killers: savedData.killers,
            flowers: savedData.flowers,
            start: savedData.start,
            pictures: savedData.pictures || [],
          },
          origin: {
            kind: "recovery",
            label: "Recovered session",
            canOverwrite: false,
          },
          displayName: savedData.levelName || "Recovered session",
          hasExternalHandle: false,
          pendingRecovery: true,
        });

        // Restore other state
        store.setState({
          activeToolId: savedData.activeToolId,
          animateSprites: savedData.animateSprites ?? true,
          showSprites: savedData.showSprites ?? true,
          viewPortOffset: savedData.viewPortOffset || { x: 0, y: 0 },
          zoom: savedData.zoom || 1,
          levelVisibility: {
            ...defaultLevelVisibility,
            ...state.levelVisibility,
            ...(savedData.levelVisibility ?? {}),
          },
          playSettings: {
            ...defaultPlaySettings,
            runEndBehavior:
              savedData.playSettings?.runEndBehavior ??
              (savedData.playSettings?.deathBehavior === "reset"
                ? "restart"
                : savedData.playSettings?.deathBehavior === "stop"
                  ? "pause"
                  : defaultPlaySettings.runEndBehavior),
            keyBindings: {
              ...defaultPlaySettings.keyBindings,
              ...(savedData.playSettings?.keyBindings ?? {}),
            },
          },
        });
      } catch (error) {
        console.error("Failed to load level from localStorage:", error);
      }
    }

    isInitializedRef.current = true;
  }, [store, key]);

  // Save to localStorage whenever relevant state changes
  useEffect(() => {
    if (!isInitializedRef.current) return;

    const unsubscribe = store.subscribe((state) => {
      const levelData: LocalStorageLevel = {
        levelName: state.levelName,
        ground: state.ground,
        sky: state.sky,
        polygons: state.polygons,
        apples: state.apples,
        killers: state.killers,
        flowers: state.flowers,
        start: state.start,
        pictures: state.pictures,
        activeToolId: state.activeToolId,
        animateSprites: state.animateSprites,
        showSprites: state.showSprites,
        viewPortOffset: state.viewPortOffset,
        zoom: state.zoom,
        levelVisibility: state.levelVisibility,
        playSettings: state.playSettings,
      };

      try {
        localStorage.setItem(key, JSON.stringify(levelData));
      } catch (error) {
        console.error("Failed to save level to localStorage:", error);
      }
    });

    return () => unsubscribe();
  }, [store, key]);

  return {
    isInitialized: isInitializedRef.current,
  };
}

// Helper function to load level data from localStorage without a store
export function loadLevelFromLocalStorage(key = "elma-web-store") {
  const item = localStorage.getItem(key);
  if (!item) return null;

  try {
    const savedData = JSON.parse(item) as LocalStorageLevel;
    return {
      name: savedData.levelName,
      ground: savedData.ground,
      sky: savedData.sky,
      polygons: savedData.polygons,
      apples: savedData.apples,
      killers: savedData.killers,
      flowers: savedData.flowers,
      start: savedData.start,
    };
  } catch (error) {
    console.error("Failed to load level from localStorage:", error);
    return null;
  }
}
