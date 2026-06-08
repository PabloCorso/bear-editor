import { cn } from "~/utils/misc";
import { IconButton, type ButtonProps } from "./button";
import { createContext, useContext } from "react";

type ToolbarOrientation = "horizontal" | "vertical";

type ToolbarContextValue = {
  orientation: ToolbarOrientation;
};

const ToolbarContext = createContext<ToolbarContextValue>({
  orientation: "horizontal",
});

export type ToolbarProps = React.ComponentPropsWithRef<"div"> & {
  orientation?: ToolbarOrientation;
};

export function Toolbar({
  className,
  orientation = "horizontal",
  ...props
}: ToolbarProps) {
  return (
    <ToolbarContext.Provider value={{ orientation }}>
      <div
        role="toolbar"
        aria-orientation={orientation}
        className={cn(
          "inline-flex items-center gap-1 rounded-xl border border-default bg-screen/80 p-1 shadow-sm",
          "aria-[orientation=vertical]:flex-col",
          className,
        )}
        {...props}
      />
    </ToolbarContext.Provider>
  );
}

type ToolbarButtonProps = ButtonProps;

export function ToolbarButton({ children, ...props }: ToolbarButtonProps) {
  return (
    <IconButton type="button" iconSize="lg" {...props}>
      {children}
    </IconButton>
  );
}

export type ToolbarSeparatorProps = React.ComponentPropsWithRef<"div"> & {
  orientation?: ToolbarOrientation;
};

export function ToolbarSeparator({
  orientation: orientationProp,
  className,
  ...props
}: ToolbarSeparatorProps) {
  const { orientation } = useContext(ToolbarContext);
  return (
    <div
      role="separator"
      aria-orientation={orientationProp ?? orientation}
      className={cn(
        "bg-separator",
        "aria-[orientation=horizontal]:mx-1 aria-[orientation=horizontal]:h-6 aria-[orientation=horizontal]:w-px",
        "aria-[orientation=vertical]:my-1 aria-[orientation=vertical]:h-px aria-[orientation=vertical]:w-6",
        className,
      )}
      {...props}
    />
  );
}
