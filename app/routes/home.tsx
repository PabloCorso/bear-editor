import type { Route } from "./+types/home";
import { EditorProvider } from "../editor/use-editor-store";
import { DefaultLevelPresetProvider } from "../editor/edit-mode/default-level-preset";
import { EditorDocumentGuardProvider } from "~/editor/session/document-guard";
import { LgrAssetsProvider } from "~/components/use-lgr-assets";
import { EditorShell } from "~/editor/app-shell";
import { TooltipProvider } from "~/components/ui/tooltip";

export function meta() {
  return [
    { title: "Bear Level Editor" },
    { name: "description", content: "Web-based level editor for ElastoMania" },
  ];
}

export function loader() {
  return { isOpenAIEnabled: !!process.env.OPENAI_API_KEY };
}

export default function Home({ params, loaderData }: Route.ComponentProps) {
  return (
    <TooltipProvider>
      <LgrAssetsProvider>
        <DefaultLevelPresetProvider>
          <EditorProvider>
            <EditorDocumentGuardProvider>
              <div className="flex h-[100dvh]">
                <EditorShell
                  isOpenAIEnabled={loaderData.isOpenAIEnabled}
                  initialLevelName={params.level}
                />
              </div>
            </EditorDocumentGuardProvider>
          </EditorProvider>
        </DefaultLevelPresetProvider>
      </LgrAssetsProvider>
    </TooltipProvider>
  );
}
