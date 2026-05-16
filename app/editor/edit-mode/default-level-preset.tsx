import { useLocalStorage } from "@mantine/hooks";
import { createContext, useContext } from "react";
import type { DefaultLevelPreset } from "~/editor/helpers/level-parser";

export const DEFAULT_LEVEL_PRESET_STORAGE_KEY = "elma-web-default-level-preset";

type DefaultLevelPresetContextValue = {
  defaultLevelPreset: DefaultLevelPreset;
  setDefaultLevelPreset: (preset: DefaultLevelPreset) => void;
};

const DefaultLevelPresetContext =
  createContext<DefaultLevelPresetContextValue | null>(null);

export function DefaultLevelPresetProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [defaultLevelPreset, setDefaultLevelPreset] =
    useLocalStorage<DefaultLevelPreset>({
      key: DEFAULT_LEVEL_PRESET_STORAGE_KEY,
      defaultValue: "default",
      getInitialValueInEffect: false,
    });

  return (
    <DefaultLevelPresetContext.Provider
      value={{
        defaultLevelPreset,
        setDefaultLevelPreset,
      }}
    >
      {children}
    </DefaultLevelPresetContext.Provider>
  );
}

function useDefaultLevelPresetContext() {
  const context = useContext(DefaultLevelPresetContext);
  if (!context) {
    throw new Error(
      "Default level preset hooks must be used within <DefaultLevelPresetProvider />",
    );
  }
  return context;
}

export function useDefaultLevelPreset() {
  return useDefaultLevelPresetContext().defaultLevelPreset;
}

export function useSetDefaultLevelPreset() {
  return useDefaultLevelPresetContext().setDefaultLevelPreset;
}
