import type { ButtonHTMLAttributes, ReactNode } from "react";
import { IslandButton } from "./IslandControls.tsx";

import "./ActionButton.css";

export type ActionTone = "primary" | "secondary" | "ghost";

const VARIANT: Record<ActionTone, "primary" | "default" | "text"> = {
  primary: "primary",
  secondary: "default",
  ghost: "text",
};

export function ActionButton({
  tone = "secondary",
  children,
  className,
  ...rest
}: {
  tone?: ActionTone;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
  return (
    <IslandButton
      className={["muziIslandAction", className].filter(Boolean).join(" ")}
      htmlType="button"
      size="middle"
      type={VARIANT[tone]}
      {...rest}
    >
      {children}
    </IslandButton>
  );
}

export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="oilActionBar">{children}</div>;
}
