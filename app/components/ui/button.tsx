import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/utils/misc";
import { Icon, type IconProps } from "./icon";

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-bold transition-colors select-none hover:bg-primary-hover/80 focus-visible:focus-ring active:bg-primary-active/80 aria-expanded:bg-primary-hover/80",
    "disabled:pointer-events-none disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        default: "",
        accent: "bg-primary",
      },
      size: {
        sm: "h-8 px-3 py-2 text-xs",
        md: "h-10 px-4 py-2.5 text-sm",
        lg: "h-12 px-5 py-3 text-base",
      },
      iconOnly: { true: "px-0", false: "" },
    },
    compoundVariants: [
      { iconOnly: true, size: "sm", className: "w-8" },
      { iconOnly: true, size: "md", className: "w-10" },
      { iconOnly: true, size: "lg", className: "w-12" },
    ],
    defaultVariants: {
      variant: "default",
      size: "md",
      iconOnly: false,
    },
  },
);

export type ButtonProps<T extends React.ElementType = "button"> = Omit<
  React.ComponentProps<T>,
  keyof VariantProps<typeof buttonVariants> | "as"
> &
  VariantProps<typeof buttonVariants> & {
    as?: T;
    iconBefore?: React.ReactNode;
    iconAfter?: React.ReactNode;
    iconSize?: IconProps["size"];
  };

export function Button<T extends React.ElementType = "button">({
  as,
  variant,
  size = "md",
  iconBefore,
  iconAfter,
  iconSize = size,
  children,
  className,
  iconOnly: iconOnlyProp,
  ...props
}: ButtonProps<T>) {
  const Comp = as ?? "button";

  const hasSingleIcon =
    !children && (iconBefore ? !iconAfter : Boolean(iconAfter));
  const iconOnly = iconOnlyProp ?? hasSingleIcon;

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, iconOnly, className }))}
      {...props}
    >
      {iconBefore && (
        <Icon size={iconSize} className="shrink-0">
          {iconBefore}
        </Icon>
      )}
      {children}
      {iconAfter && (
        <Icon size={iconSize} className="shrink-0">
          {iconAfter}
        </Icon>
      )}
    </Comp>
  );
}

export type IconButtonProps<T extends React.ElementType = "button"> = Omit<
  React.ComponentProps<T>,
  keyof VariantProps<typeof buttonVariants> | "as"
> &
  Omit<VariantProps<typeof buttonVariants>, "iconOnly"> & {
    as?: T;
    iconSize?: IconProps["size"];
  };

export function IconButton<T extends React.ElementType = "button">({
  as,
  children,
  ...props
}: IconButtonProps<T>) {
  return <Button as={as as any} iconBefore={children} iconOnly {...props} />;
}
