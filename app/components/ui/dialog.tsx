import { XIcon } from "@phosphor-icons/react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import * as React from "react";
import { IconButton, type IconButtonProps } from "./button";
import { cn } from "~/utils/misc";

export type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root>;

export const Dialog = DialogPrimitive.Root;

export type DialogTriggerProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Trigger>,
  "children" | "render"
> & { children: React.ReactElement };

export function DialogTrigger(props: DialogTriggerProps) {
  const { children, ...triggerProps } = props;
  return <DialogPrimitive.Trigger render={children} {...triggerProps} />;
}

export const DialogPortal = DialogPrimitive.Portal;

export type DialogCloseProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Close>,
  "children" | "render"
> & { children: React.ReactElement };

export function DialogClose(props: DialogCloseProps) {
  const { children, ...closeProps } = props;
  return <DialogPrimitive.Close render={children} {...closeProps} />;
}

export function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Backdrop>) {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        "fixed inset-0 z-50 bg-screen/40 data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:animate-in data-[open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

type DialogContentProps = React.ComponentProps<typeof DialogPrimitive.Popup>;

export function DialogContent({
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        className={cn(
          "fixed top-[50%] left-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] overflow-x-hidden overflow-y-auto rounded-lg border border-default bg-screen data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95 sm:max-w-lg",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

export function DialogXClose(props: IconButtonProps) {
  const ariaLabel = props["aria-label"] ?? "Close";
  return (
    <DialogPrimitive.Close
      render={
        <IconButton {...props} aria-label={ariaLabel}>
          <XIcon aria-hidden="true" />
        </IconButton>
      }
    />
  );
}

export function DialogHeader({
  className,
  children,
  closeLabel,
  showCloseButton = false,
  ...props
}: React.ComponentProps<"div"> & {
  closeLabel?: string;
  showCloseButton?: boolean;
}) {
  return (
    <div
      className={cn("flex items-center gap-2 p-3.5 pl-6", className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogXClose className="ml-auto self-start" aria-label={closeLabel} />
      )}
    </div>
  );
}

export function DialogBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2 px-6 pb-3", className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-xl font-bold", className)}
      {...props}
    />
  );
}

export function DialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex justify-end gap-3 p-3", className)} {...props} />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm", className)}
      {...props}
    />
  );
}
