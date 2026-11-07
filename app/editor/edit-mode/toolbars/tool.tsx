import {
  useEditor,
  useEditorActiveTool,
  useEditorActions,
} from "~/editor/use-editor-store";
import { cn } from "~/utils/misc";
import { ToolButton, type ToolButtonProps } from "~/components/tool-button";
import { createContext, useContext } from "react";
import type { ToolMeta } from "../tools/default-tools";

const ToolSelectionContext = createContext<(() => void) | undefined>(undefined);

export function useToolSelection() {
  return useContext(ToolSelectionContext);
}

export type ToolControlButtonProps = ToolButtonProps &
  Pick<ToolMeta, "menuBehavior"> & {
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
  menuBehavior: _menuBehavior,
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
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  children: React.ReactNode;
}) {
  // Use the middle grid row as the containing block so the toolbar scroll
  // does not clip the submenu. Only the visible submenu should receive input.
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 left-16 z-40 flex items-center">
      <div
        className={cn(
          "pointer-events-auto max-h-full overflow-auto",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </div>
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
      <ToolSelectionContext.Provider value={() => setToolMenuOpen(!isOpen, id)}>
        {button}
      </ToolSelectionContext.Provider>
      {isOpen && (
        <ToolSelectionContext.Provider value={() => setToolMenuOpen(false)}>
          <ToolMenu
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
