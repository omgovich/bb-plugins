import type { ButtonHTMLAttributes } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

export function IconButton({
  icon,
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        focusRing,
        className,
      )}
      {...props}
    >
      <Icon name={icon} className="size-3.5" aria-hidden />
    </button>
  );
}
