import { useEffect } from "react";
import { EditorProvider, useEditor } from "../editor/use-editor-store";
import { DefaultLevelPresetProvider } from "../editor/edit-mode/default-level-preset";
import { EditorDocumentGuardProvider } from "~/editor/session/document-guard";
import { LgrAssetsProvider, useLgrAssets } from "~/components/use-lgr-assets";
import { EditorShell } from "~/editor/app-shell";
import { TooltipProvider } from "~/components/ui/tooltip";
import type { InitialLevelSource } from "~/editor/edit-mode/editor-view";

export function meta() {
  return [
    { title: "Bear Level Editor" },
    { name: "description", content: "Web-based level editor for ElastoMania" },
  ];
}

export default function Home() {
  return <EditorPage />;
}

export function EditorPage({
  initialLevel,
}: {
  initialLevel?: InitialLevelSource;
}) {
  return (
    <TooltipProvider>
      <LgrAssetsProvider>
        <DefaultLevelPresetProvider>
          <EditorProvider>
            <LevelLgrSync />
            <EditorDocumentGuardProvider>
              <div className="flex h-[100dvh]">
                <EditorShell initialLevel={initialLevel} />
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
