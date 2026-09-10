import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ModalProps } from "animal-island-ui";
import { IslandButton as Button } from "./IslandSurfaces.tsx";
import "./IslandModal.css";

/** A theme-inheriting modal. Parents retain authority over dismissal while an operation is pending. */
export function IslandModal({ open, title, width = 480, maskClosable = true, footer, onClose, onOk, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current!;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    const initial = dialog.querySelector<HTMLElement>(".islandModalBody input:not(:disabled), .islandModalBody textarea:not(:disabled)")
      ?? dialog.querySelector<HTMLElement>(".islandModalFooter button:not(:disabled)");
    initial?.focus();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(<dialog
    ref={dialogRef}
    role="dialog"
    aria-modal="true"
    aria-labelledby={title === undefined ? undefined : titleId}
    aria-label={title === undefined ? "对话框" : undefined}
    data-plugin-modal="dsh-muzi-creator"
    className={["islandModal", className].filter(Boolean).join(" ")}
    style={{ width }}
    onCancel={(event) => { event.preventDefault(); onClose?.(); }}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (first === undefined || last === undefined) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onClick={(event) => {
      if (!maskClosable || event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose?.();
    }}
  >
    <header className="islandModalHeader">
      <h2 id={titleId}>{title}</h2>
      <button className="islandModalClose" type="button" aria-label="关闭" onClick={onClose}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
    </header>
    <div className="islandModalBody">{children}</div>
    {footer !== null && <footer className="islandModalFooter">{footer ?? <><Button onClick={onClose}>取消</Button><Button type="primary" onClick={onOk}>确认</Button></>}</footer>}
  </dialog>, document.body);
}
