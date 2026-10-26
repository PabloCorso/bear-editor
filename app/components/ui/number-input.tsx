import { NumberField } from "@base-ui/react/number-field";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { flushSync } from "react-dom";
import { cn } from "~/utils/misc";
import { IconButton } from "./button";
import { Input, type InputProps } from "./input";

export type NumberInputProps = Omit<
  NumberField.Root.Props,
  "children" | "render" | "className" | "aria-label"
> & {
  "aria-label": string;
  className?: string;
  size?: InputProps["size"];
  /** Override the button step when using the input's arrow keys. */
  keyboardStep?: number;
  inputProps?: Omit<NumberField.Input.Props, "render" | "className"> & {
    className?: string;
  };
};

export function NumberInput({
  "aria-label": label,
  className,
  size = "md",
  inputProps,
  step = 1,
  smallStep,
  largeStep,
  keyboardStep,
  ...props
}: NumberInputProps) {
  const {
    className: inputClassName,
    onKeyDown,
    ...restInputProps
  } = inputProps ?? {};
  const [keyboardStepping, setKeyboardStepping] = useState(false);
  const activeKeyboardStep = keyboardStepping ? keyboardStep : undefined;
  const buttonStep = step === "any" ? 1 : step;

  function selectButtonStep() {
    if (keyboardStepping) {
      flushSync(() => setKeyboardStepping(false));
    }
  }
  const buttonClassName = cn(
    "rounded text-secondary hover:text-primary",
    size === "sm" ? "h-6 w-6" : "h-8 w-8",
  );

  return (
    <NumberField.Root
      step={activeKeyboardStep ?? step}
      smallStep={activeKeyboardStep ?? smallStep}
      largeStep={activeKeyboardStep ?? largeStep}
      className={cn(
        "inline-flex shrink-0 items-center gap-1",
        size === "sm" ? "h-6" : "h-8",
        className,
      )}
      {...props}
    >
      <NumberField.Decrement
        aria-label={`Decrease ${label.toLowerCase()} by ${buttonStep}`}
        title={`Decrease by ${buttonStep}`}
        onPointerDownCapture={selectButtonStep}
        onClickCapture={selectButtonStep}
        render={
          <IconButton
            type="button"
            size="sm"
            iconSize="sm"
            className={buttonClassName}
          />
        }
      >
        <MinusIcon aria-hidden="true" />
      </NumberField.Decrement>
      <NumberField.Input
        aria-label={label}
        render={
          <Input
            size={size}
            className={cn(
              "h-full w-12 px-1 text-center text-inherit tabular-nums",
              inputClassName,
            )}
          />
        }
        {...restInputProps}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (
            !event.defaultPrevented &&
            keyboardStep !== undefined &&
            !keyboardStepping &&
            (event.key === "ArrowUp" || event.key === "ArrowDown")
          ) {
            // Base UI reads the step in its handler for this same event.
            flushSync(() => setKeyboardStepping(true));
          }
        }}
      />
      <NumberField.Increment
        aria-label={`Increase ${label.toLowerCase()} by ${buttonStep}`}
        title={`Increase by ${buttonStep}`}
        onPointerDownCapture={selectButtonStep}
        onClickCapture={selectButtonStep}
        render={
          <IconButton
            type="button"
            size="sm"
            iconSize="sm"
            className={buttonClassName}
          />
        }
      >
        <PlusIcon aria-hidden="true" />
      </NumberField.Increment>
    </NumberField.Root>
  );
}
