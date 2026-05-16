import fastDeepEqual from "fast-deep-equal";
import { useEffect, useRef } from "react";
import type { EditorState } from "./editor-state";
import { defaultLevelVisibility } from "./level-visibility";
import {
  DEFAULT_PLAY_MODE_ZOOM,
  defaultPlaySettings,
} from "./play-mode/play-settings";
import type { EditorStore } from "./editor-store";
import type { EditorPreferences } from "./editor-preference-types";

const EDITOR_PREFERENCES_STORAGE_KEY = "elma-web-editor-preferences";

type PersistedEditorPreferences = {
  version: 1;
  preferences: EditorPreferences;
};

function isClient() {
  return typeof window !== "undefined";
}

function getStoredItem(key: string) {
  if (!isClient()) return null;
  return window.localStorage.getItem(key);
}

function parseStoredItem<T>(key: string): T | null {
  const item = getStoredItem(key);
  if (!item) return null;

  try {
    return JSON.parse(item) as T;
  } catch (error) {
    console.error(`Failed to parse localStorage item "${key}":`, error);
    return null;
  }
}

const defaultEditorPreferences: EditorPreferences = {
  animateSprites: true,
  isUIVisible: true,
  levelVisibility: defaultLevelVisibility,
  playModeZoom: DEFAULT_PLAY_MODE_ZOOM,
  playSettings: defaultPlaySettings,
  vertexEdgeClickBehavior: "internal",
};

export function loadEditorPreferences(): EditorPreferences {
  const persistedPreferences = parseStoredItem<PersistedEditorPreferences>(
    EDITOR_PREFERENCES_STORAGE_KEY,
  );
  const preferences = persistedPreferences?.preferences;

  return {
    animateSprites:
      preferences?.animateSprites ?? defaultEditorPreferences.animateSprites,
    isUIVisible:
      preferences?.isUIVisible ?? defaultEditorPreferences.isUIVisible,
    levelVisibility: {
      ...defaultLevelVisibility,
      ...(preferences?.levelVisibility ?? {}),
    },
    playModeZoom:
      preferences?.playModeZoom ?? defaultEditorPreferences.playModeZoom,
    playSettings: {
      ...defaultPlaySettings,
      ...(preferences?.playSettings ?? {}),
      keyBindings: {
        ...defaultPlaySettings.keyBindings,
        ...(preferences?.playSettings?.keyBindings ?? {}),
      },
    },
    vertexEdgeClickBehavior:
      preferences?.vertexEdgeClickBehavior ??
      defaultEditorPreferences.vertexEdgeClickBehavior,
  };
}

function getPersistedEditorPreferences(
  state: EditorState,
): PersistedEditorPreferences {
  return {
    version: 1,
    preferences: getComparableEditorPreferences(state),
  };
}

function getComparableEditorPreferences(state: EditorState): EditorPreferences {
  return {
    animateSprites: state.animateSprites,
    isUIVisible: state.isUIVisible,
    levelVisibility: state.levelVisibility,
    playModeZoom: state.playModeZoom,
    playSettings: state.playSettings,
    vertexEdgeClickBehavior: state.vertexEdgeClickBehavior,
  };
}

export function useEditorPreferencesSync(
  store: EditorStore,
  key = EDITOR_PREFERENCES_STORAGE_KEY,
) {
  const lastSavedValueRef = useRef<string | null>(null);
  const lastSavedPreferencesRef = useRef<EditorPreferences | null>(null);

  useEffect(
    function primeSavedPreferencesSnapshot() {
      lastSavedValueRef.current = getStoredItem(key);
      lastSavedPreferencesRef.current = getComparableEditorPreferences(
        store.getState(),
      );
    },
    [store, key],
  );

  useEffect(
    function syncEditorPreferencesToLocalStorage() {
      const unsubscribe = store.subscribe((state) => {
        if (!isClient()) return;

        const nextPreferences = getComparableEditorPreferences(state);
        if (
          lastSavedPreferencesRef.current &&
          fastDeepEqual(lastSavedPreferencesRef.current, nextPreferences)
        ) {
          return;
        }

        const nextValue = JSON.stringify(getPersistedEditorPreferences(state));
        if (lastSavedValueRef.current === nextValue) return;

        try {
          window.localStorage.setItem(key, nextValue);
          lastSavedValueRef.current = nextValue;
          lastSavedPreferencesRef.current = nextPreferences;
        } catch (error) {
          console.error(
            "Failed to save editor preferences to localStorage:",
            error,
          );
        }
      });

      return unsubscribe;
    },
    [store, key],
  );
}
