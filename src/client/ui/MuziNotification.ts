import {
  notificationDestroy,
  notificationOpen,
  type NotificationType,
} from "animal-island-ui";

import "./MuziNotification.css";

export type MuziNotificationKind = NotificationType;

export interface MuziNotificationOptions {
  kind: MuziNotificationKind;
  message: string;
  description?: string;
  key?: string;
  duration?: number;
}

const PLUGIN_ID = "dsh-muzi-creator";
const ROOT_SELECTOR = "[data-animal-notification-root]";
const DEFAULT_DURATION: Record<MuziNotificationKind, number> = {
  success: 3,
  info: 3,
  warning: 5,
  error: 5,
};

let sequence = 0;
let rootObserver: MutationObserver | undefined;
const ownedKeys = new Set<string>();

function notificationRoot(): HTMLElement | undefined {
  if (typeof document === "undefined") return undefined;
  const root = document.querySelector<HTMLElement>(ROOT_SELECTOR);
  if (root === null) return undefined;
  root.dataset.plugin = PLUGIN_ID;
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-atomic", "false");
  root.setAttribute("aria-hidden", ownedKeys.size === 0 ? "true" : "false");
  root.setAttribute(
    "aria-label",
    document.documentElement.lang.toLowerCase().startsWith("zh")
      ? "工作台通知"
      : "Workbench notifications",
  );
  const closeLabel = document.documentElement.lang.toLowerCase().startsWith("zh")
    ? "关闭通知"
    : "Close notification";
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-notification-key] button",
  )) {
    button.setAttribute("aria-label", closeLabel);
  }
  if (rootObserver === undefined && typeof MutationObserver !== "undefined") {
    rootObserver = new MutationObserver(() => {
      notificationRoot();
    });
    rootObserver.observe(root, { childList: true, subtree: true });
  }
  return root;
}

/** Shows a themed, top-centered workbench notification. */
export function showMuziNotification(options: MuziNotificationOptions): void {
  if (typeof document === "undefined") return;
  const key = options.key ?? `muzi-notification-${Date.now()}-${++sequence}`;
  ownedKeys.add(key);
  notificationOpen(
    {
      message: options.message,
      ...(options.description === undefined
        ? {}
        : { description: options.description }),
      duration: options.duration ?? DEFAULT_DURATION[options.kind],
      position: "top",
      key,
      className: `muziNotification muziNotification-${options.kind}`,
      onClose: () => {
        ownedKeys.delete(key);
        notificationRoot();
      },
    },
    options.kind,
  );
  notificationRoot();
  queueMicrotask(() => {
    notificationRoot();
  });
}

/** Removes notifications created by this plugin and releases its observer. */
export function destroyMuziNotifications(): void {
  for (const key of ownedKeys) notificationDestroy(key);
  ownedKeys.clear();
  rootObserver?.disconnect();
  rootObserver = undefined;
  notificationRoot();
}
