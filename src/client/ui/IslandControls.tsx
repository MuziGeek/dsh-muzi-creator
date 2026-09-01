import type {
  ChangeEventHandler,
  KeyboardEvent,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import {
  Card as AnimalCard,
  type CardColor as AnimalCardColor,
  type CardProps as AnimalCardProps,
  Select as AnimalSelect,
  type SelectProps as AnimalSelectProps,
  Skeleton as AnimalSkeleton,
} from "animal-island-ui";
import {
  selectableIslandOptions,
  type IslandSelectOption,
} from "./selectOptions.ts";
import "./IslandControls.css";

export {
  Button as IslandButton,
  Card as IslandCard,
  Checkbox as IslandCheckbox,
  Divider as IslandDivider,
  Drawer as IslandDrawer,
  Icon as IslandIcon,
  Input as IslandInput,
  Modal as IslandModal,
  Radio as IslandRadio,
  Skeleton as IslandSkeleton,
  Switch as IslandSwitch,
  Tabs as IslandTabs,
  Tag as IslandTag,
  Title as IslandTitle,
  Tooltip as IslandTooltip,
} from "animal-island-ui";

export type {
  ButtonProps as IslandButtonProps,
  CardColor as IslandCardColor,
  CardProps as IslandCardProps,
  CheckboxProps as IslandCheckboxProps,
  InputProps as IslandInputProps,
  ModalProps as IslandModalProps,
  RadioProps as IslandRadioProps,
  SwitchProps as IslandSwitchProps,
  TabItem as IslandTabItem,
  TabsProps as IslandTabsProps,
  TagProps as IslandTagProps,
  TagColor as IslandTagColor,
} from "animal-island-ui";

export { selectableIslandOptions, type IslandSelectOption } from "./selectOptions.ts";

export interface IslandSelectProps extends Omit<AnimalSelectProps, "options"> {
  options: IslandSelectOption[];
}

/** Animal Select adapter that keeps unavailable choices visible but outside its interactive list. */
export function IslandSelect({ options, value, placeholder, disabled, ...props }: IslandSelectProps) {
  const unavailable = options.filter((option) => option.disabled === true);
  const selectable = selectableIslandOptions(options);
  const selected = options.find((option) => option.key === value);
  const selectedUnavailableLabel = selected?.disabled === true ? `${selected.label}（不可用）` : undefined;
  return <>
    <AnimalSelect
      {...props}
      options={selectable}
      value={selectedUnavailableLabel === undefined ? value : ""}
      placeholder={selectedUnavailableLabel ?? placeholder}
      disabled={disabled === true || selectable.length === 0}
    />
    {unavailable.length > 0 && <small className="islandSelectUnavailable">
      不可用选项：{unavailable.map((option) => `${option.label}${option.disabledReason === undefined ? "" : `（${option.disabledReason}）`}`).join("；")}
    </small>}
  </>;
}

export interface IslandSelectableCardProps extends Omit<AnimalCardProps, "color" | "hoverable" | "onClick"> {
  selected?: boolean;
  disabled?: boolean;
  selectedColor?: AnimalCardColor;
  onSelect: () => void;
}

/** Keyboard-selectable Animal Card for list and grid choices. */
export function IslandSelectableCard({
  selected = false,
  disabled = false,
  selectedColor = "lime-green",
  className,
  onKeyDown,
  onSelect,
  ...props
}: IslandSelectableCardProps) {
  const activate = (): void => {
    if (!disabled) onSelect();
  };
  return (
    <AnimalCard
      {...props}
      className={["islandSelectableCard", selected && "is-selected", className].filter(Boolean).join(" ")}
      color={selected ? selectedColor : "default"}
      hoverable={!disabled}
      role="button"
      aria-pressed={selected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={activate}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || disabled || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        activate();
      }}
    />
  );
}

export interface IslandTextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "defaultValue" | "onChange" | "value"
> {
  value: string;
  onChange: ChangeEventHandler<HTMLTextAreaElement>;
}

/** Controlled native textarea used only where Animal Island has no multiline control. */
export function IslandTextarea({ className, ...props }: IslandTextareaProps) {
  return <textarea {...props} className={["islandTextarea", className].filter(Boolean).join(" ")} />;
}

export interface IslandStateProps {
  kind: "empty" | "error" | "info" | "loading";
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}

/** Consistent loading, empty, error and informational state inside plugin surfaces. */
export function IslandState({ kind, title, message, action, className }: IslandStateProps) {
  const role = kind === "error" ? "alert" : "status";
  return (
    <AnimalCard
      type="dashed"
      color={kind === "info" ? "app-yellow" : "default"}
      className={["islandState", `islandState-${kind}`, className].filter(Boolean).join(" ")}
      role={role}
      aria-busy={kind === "loading"}
    >
      {kind === "loading" && <AnimalSkeleton variant="paragraph" rows={3} active />}
      <strong>{title}</strong>
      {message !== undefined && <p>{message}</p>}
      {action !== undefined && <div className="islandStateAction">{action}</div>}
    </AnimalCard>
  );
}
