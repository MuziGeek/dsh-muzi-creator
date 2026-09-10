import type { WorkspaceId } from "@deepseek-ai/dsh-client-connection/client";
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    "sidebar.workspaces": { kind: "single"; scope: "root"; owner: SidebarSectionOwnerProps };
    "sidebar.settings": { kind: "single"; scope: "root"; owner: SidebarSettingsOwnerProps };
    "sidebar.footer.action": { kind: "list"; scope: "root"; owner: SidebarFooterActionOwnerProps };
  }
}

export interface SidebarSectionOwnerProps {
  wide: boolean;
  expandSidebar: () => void;
}

export interface SidebarSettingsOwnerProps {
  wide: boolean;
}

export interface SidebarFooterActionOwnerProps {
  wide: boolean;
}

export interface MzSidebarInjected {
  startSession: (workspaceId?: WorkspaceId) => void | Promise<void>;
  toggleSidebar: () => void;
}

export type MzSidebarSlotProps =
  & PropsRuntime<"sidebar">
  & PropsRenderSlots<"sidebar.workspaces" | "sidebar.settings" | "sidebar.footer.action">
  & MzSidebarInjected
  & PropsLocale<"dsh.mz.creator">;
