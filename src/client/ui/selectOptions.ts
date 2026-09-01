/** Option contract for the controlled Animal Island select adapter. */
export interface IslandSelectOption {
  key: string;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
}

/** Return only options the Animal Select may focus or activate. */
export function selectableIslandOptions(options: IslandSelectOption[]): Array<{ key: string; label: string }> {
  return options
    .filter((option) => option.disabled !== true)
    .map(({ key, label }) => ({ key, label }));
}
