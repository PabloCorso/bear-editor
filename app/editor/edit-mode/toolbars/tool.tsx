import {
  useEditorActiveTool,
  useEditorActions,
} from "~/editor/use-editor-store";
import { cn } from "~/utils/misc";
import { FloatingViewportToolbar } from "./floating-toolbar";
import {
  ToolButton,
  type ToolButtonProps,
} from "~/components/tool-button";

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
        if (id) activateTool(id);
        onClick?.(event);
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
  return (
    <>
      {button}
      <ToolMenu id={id}>{children}</ToolMenu>
    </>
  );
}
