import { WorkbenchIcon } from "./WorkbenchIcon.tsx";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    "settings.trigger": { kind: "single"; scope: "root"; owner: { wide: boolean } };
  }
}

/** Settings trigger content; the host retains the button and dialog behavior. */
export function WorkbenchSettingsTrigger({ wide, t }: { wide: boolean; t: (key: "settings.trigger") => string }) {
  return <span data-plugin="dsh-muzi-creator" className="muziIconLabel">
    <WorkbenchIcon name="settings" size={28} />
    <span className={wide ? undefined : "muziIconSrOnly"}>{t("settings.trigger")}</span>
  </span>;
}
