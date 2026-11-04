import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "tw:inline-flex tw:items-center tw:justify-center tw:gap-2 tw:rounded-lg tw:text-sm tw:font-medium tw:transition-colors tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:disabled:pointer-events-none tw:disabled:opacity-50",
  { variants: { variant: { default: "tw:bg-[var(--color-text)] tw:text-[var(--color-canvas)]", outline: "tw:border tw:border-[var(--color-border)] tw:bg-[var(--color-surface)]" }, size: { default: "tw:h-9 tw:px-3", sm: "tw:h-8 tw:px-3" } }, defaultVariants: { variant: "default", size: "default" } }
);
function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
export { Button, buttonVariants };
