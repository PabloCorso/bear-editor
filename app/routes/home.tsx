import type { Route } from "./+types/home";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { EditorProvider, useEditor } from "../editor/use-editor-store";
import { DefaultLevelPresetProvider } from "../editor/edit-mode/default-level-preset";
import { EditorDocumentGuardProvider } from "~/editor/session/document-guard";
import { LgrAssetsProvider, useLgrAssets } from "~/components/use-lgr-assets";
import { EditorShell } from "~/editor/app-shell";
import { TooltipProvider } from "~/components/ui/tooltip";

export function meta() {
  return [
    { title: "Bear Level Editor" },
    { name: "description", content: "Web-based level editor for ElastoMania" },
  ];
}

export default function Home({ params }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const [rendererBackend] = useState(() =>
    searchParams.get("renderer") === "rectools" ? "rectools" : "webgl",
  );
  return (
    <TooltipProvider>
      <LgrAssetsProvider>
        <DefaultLevelPresetProvider>
          <EditorProvider>
            <LevelLgrSync />
            <EditorDocumentGuardProvider>
              <div className="flex h-[100dvh]">
                <EditorShell
                  initialLevelName={params.level}
                  rendererBackend={rendererBackend}
                />
              </div>
            </EditorDocumentGuardProvider>
          </EditorProvider>
        </DefaultLevelPresetProvider>
      </LgrAssetsProvider>
    </TooltipProvider>
  );
}

function LevelLgrSync() {
  const levelLgrName = useEditor((state) => state.lgr);
  const { selectLgr } = useLgrAssets();

  useEffect(
    function syncLgrWithLevel() {
      void selectLgr(levelLgrName || "default");
    },
    [levelLgrName, selectLgr],
  );

  return null;
}
