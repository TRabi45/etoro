import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * The product's button.
 *
 * Sizing is an accessibility requirement rather than a taste call: 40px is the
 * desktop minimum and 44px the touch minimum, so `md` is 40 and grows to 44
 * under a coarse pointer. `sm` exists for dense toolbars sitting inside a table
 * header and is the one size that may go below 40 - it is never the only way to
 * reach an action.
 *
 * `primary` fills with eToro green and sets **near-black** text. White on
 * #13c636 is roughly 2.2:1 and fails AA outright; the brand direction calls
 * this out specifically, so the rule lives in the variant rather than in each
 * caller's head.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-primary border border-brand hover:bg-brand-hover hover:border-brand-hover disabled:bg-brand/40 disabled:border-transparent",
  secondary:
    "bg-surface text-primary border border-border-control hover:bg-surface-subtle hover:border-secondary",
  ghost:
    "bg-transparent text-secondary border border-transparent hover:bg-surface-subtle hover:text-primary",
  danger: "bg-surface text-danger border border-danger/40 hover:bg-danger-soft",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  // Below the 40px floor by design, and only for toolbar controls that always
  // have a full-size equivalent elsewhere.
  sm: "h-8 px-2.5 text-caption gap-1.5",
  md: "h-10 px-3.5 text-body gap-2 [@media(pointer:coarse)]:h-11",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** Places the icon after the label - for "open" and "next" affordances. */
  iconAfter?: IconName;
  children?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconAfter,
  children,
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      // Defaulting to `button` matters: an unspecified type inside a form is
      // `submit`, which has caused a filter chip to reload the page in every
      // codebase that forgot it.
      type={type}
      className={`inline-flex items-center justify-center rounded-control font-medium whitespace-nowrap motion-standard transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 14 : 16} /> : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} size={size === "sm" ? 14 : 16} /> : null}
    </button>
  );
}
