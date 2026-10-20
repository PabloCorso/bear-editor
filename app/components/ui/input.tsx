import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/utils/misc";

export const inputVariants = cva(
  "min-w-0 rounded border border-gray-600 bg-gray-700 text-white outline-hidden placeholder:text-secondary focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-40",
  {
    variants: {
      size: {
        sm: "h-6 px-1.5 py-0.5 text-xs",
        md: "h-8 px-2 py-1 text-sm",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

export type InputProps = Omit<React.ComponentPropsWithRef<"input">, "size"> &
  VariantProps<typeof inputVariants>;

export function Input({ className, size, ...props }: InputProps) {
  return (
    <input className={cn(inputVariants({ size }), className)} {...props} />
  );
}
