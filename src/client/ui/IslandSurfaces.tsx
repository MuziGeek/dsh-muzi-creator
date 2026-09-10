import { Button, Card, Tag, type ButtonProps, type CardProps, type TagProps } from "animal-island-ui";
import "./IslandSurfaces.css";

/** Preserve library button behavior while exposing theme-owned appearance states. */
export function IslandButton({ className, type = "default", size = "middle", danger, ghost, ...props }: ButtonProps) {
  return <Button {...props} type={type} size={size} danger={danger} ghost={ghost} className={["islandButton", className].filter(Boolean).join(" ")} data-island-kind={type} data-island-size={size} data-island-danger={danger || undefined} data-island-ghost={ghost || undefined} />;
}

/** Cards inherit the active surface palette, including selectable variants. */
export function IslandCard({ className, color = "default", pattern, type = "default", hoverable, ...props }: CardProps) {
  return <Card {...props} color={color} pattern={pattern} type={type} hoverable={hoverable} data-island-color={color} data-island-pattern={pattern} data-island-kind={type} data-island-hoverable={hoverable || undefined} className={["islandCard", className].filter(Boolean).join(" ")} />;
}

/** Status labels retain their semantic tone across skins. */
export function IslandTag({ className, color = "default", variant = "solid", ...props }: TagProps) {
  const tone = color === "app-red" ? "danger" : color === "app-yellow" || color === "app-orange" ? "warning"
    : color === "app-green" || color === "lime-green" || color === "yellow-green" ? "success" : "neutral";
  return <Tag {...props} color={color} variant={variant} className={["islandTag", `islandTag-${tone}`, `islandTagColor-${color}`, `islandTagVariant-${variant}`, className].filter(Boolean).join(" ")} />;
}
