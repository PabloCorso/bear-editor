import {
  useEditor,
  useEditorActiveTool,
  useEditorActions,
} from "~/editor/use-editor-store";
import { cn } from "~/utils/misc";
import { FloatingViewportToolbar } from "./floating-toolbar";
import { ToolButton, type ToolButtonProps } from "~/components/tool-button";
import { createContext, useContext } from "react";

const ToolSelectionContext = createContext<(() => void) | undefined>(undefined);

export function useToolSelection() {
  return useContext(ToolSelectionContext);
}

export type ToolControlButtonProps = ToolButtonProps & {
  id?: string;
  isActive?: boolean;
  isLoading?: boolean;
};

export function ToolControlButton({
  id,
  isActive: isActiveProp,
  className,
  children,
  onClick,
  isLoading,
  ...props
}: ToolControlButtonProps) {
  const activeTool = useEditorActiveTool();
  const { activateTool } = useEditorActions();
  const onSelect = useToolSelection();
  const isActive = isActiveProp ?? (id ? activeTool?.meta.id === id : false);
  return (
    <ToolButton
      aria-pressed={isActive}
      className={cn(
        {
          "bg-primary-hover/50": isActive,
        },
        className,
      )}
      isLoading={isLoading}
      onClick={(event) => {
        if (id && activeTool?.meta.id !== id) activateTool(id);
        onClick?.(event);
        onSelect?.();
      }}
      {...props}
    >
      {children}
    </ToolButton>
  );
}

export function ToolMenu({
  id,
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  id: string;
  children: React.ReactNode;
}) {
  const activeTool = useEditorActiveTool();
  const isActive = activeTool?.meta.id === id;
  if (!isActive) return null;
  return (
    <FloatingViewportToolbar className={className} {...props}>
      {children}
    </FloatingViewportToolbar>
  );
}

type ToolControlMenuProps = {
  id: string;
  button: React.ReactNode;
  children: React.ReactNode;
};

export function ToolControlMenu({
  id,
  button,
  children,
}: ToolControlMenuProps) {
  const isOpen = useEditor((state) => state.openToolMenuId === id);
  const { setToolMenuOpen } = useEditorActions();

  return (
    <>
      <ToolSelectionContext.Provider value={() => setToolMenuOpen(!isOpen)}>
        {button}
      </ToolSelectionContext.Provider>
      {isOpen && (
        <ToolSelectionContext.Provider value={() => setToolMenuOpen(false)}>
          <ToolMenu
            id={id}
            onKeyDown={(event) => {
              // Let Enter click the focused choice, without reaching canvas shortcuts.
              if (
                event.key === "Enter" &&
                event.target instanceof HTMLButtonElement
              ) {
                event.stopPropagation();
              }
            }}
          >
            {children}
          </ToolMenu>
        </ToolSelectionContext.Provider>
      )}
    </>
  );
}
