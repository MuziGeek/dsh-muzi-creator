import {
  Select as AnimalSelect,
  type SelectProps as AnimalSelectProps,
} from "animal-island-ui";
import {
  selectableIslandOptions,
  type IslandSelectOption,
} from "./selectOptions.ts";

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
  CheckboxProps as IslandCheckboxProps,
  InputProps as IslandInputProps,
  ModalProps as IslandModalProps,
  RadioProps as IslandRadioProps,
  SwitchProps as IslandSwitchProps,
  TabItem as IslandTabItem,
  TabsProps as IslandTabsProps,
  TagProps as IslandTagProps,
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
