import { LucideIcon, Loader2 } from "lucide-react";
import React from "react";
import {
  Button as ShadcnButton,
  type ButtonProps as ShadcnButtonProps,
} from "@/components/ui/button";
import { cn } from "@/lib/utils";

const variantMap = {
  primary: "default",
  secondary: "outline",
  ghost: "ghost",
} as const;

const sizeMap = {
  sm: "sm",
  md: "default",
  lg: "lg",
} as const;

const iconSizeMap = {
  sm: 14,
  md: 16,
  lg: 18,
} as const;

interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  children?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
  isActive?: boolean;
  isLoading?: boolean;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon: Icon,
  className,
  isActive = false,
  isLoading = false,
  disabled,
  ...props
}: ButtonProps) {
  const shadcnVariant = isActive ? "ghost" : variantMap[variant];
  const shadcnSize = !children && Icon ? "icon" : sizeMap[size];
  const iconSize = iconSizeMap[size];

  return (
    <ShadcnButton
      variant={shadcnVariant as ShadcnButtonProps["variant"]}
      size={shadcnSize as ShadcnButtonProps["size"]}
      className={cn(isActive && "text-blue-500", className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 size={iconSize} className="animate-spin" />
      ) : (
        Icon && <Icon size={iconSize} />
      )}
      {children}
    </ShadcnButton>
  );
}
