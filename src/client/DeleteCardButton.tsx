import { WorkbenchIcon } from "./ui/WorkbenchIcon.tsx";
import { useEffect, useRef, useState } from "react";
import { IslandButton, IslandModal } from "./ui/IslandControls.tsx";
import { deleteZh } from "./deleteCopy.ts";
import "./DeleteCardButton.css";

/** Confirm removal from the workbench while keeping source files. */
export function DeleteCardButton({ title, onDelete, disabled = false, t = (key) => key }: {
  title: string;
  onDelete: () => Promise<void>;
  disabled?: boolean;
  t?: ((key: string) => string) | undefined;
}) {
  const pending = useRef(false);
  const body = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const dialog = body.current?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    dialog.dataset.pluginModal = "dsh-muzi-creator";
    return () => { delete dialog.dataset.pluginModal; };
  }, [open]);
  const text = (key: keyof typeof deleteZh): string => {
    const value = t(key);
    return value === key ? deleteZh[key] : value;
  };
  const remove = async (): Promise<void> => {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try { await onDelete(); setOpen(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : text("cardDelete.failed")); }
    finally { pending.current = false; setBusy(false); }
  };
  return <div className="cardDeleteActions">
    <IslandButton icon={<WorkbenchIcon name="remove" />} type="text" size="small" danger disabled={disabled || busy}
      aria-label={`${text("cardDelete.label")}：${title}`}
      title={disabled ? text("cardDelete.stopFirst") : text("cardDelete.keepFiles")}
      onClick={() => { setError(null); setOpen(true); }}>
      {text(busy ? "cardDelete.busy" : "cardDelete.label")}
    </IslandButton>
    {open && <IslandModal
      open
      className="cardDeleteModal"
      title={text("cardDelete.confirm")}
      width="min(430px, calc(100vw - 32px))"
      typewriter={false}
      maskClosable={!busy}
      onClose={() => { if (!pending.current) setOpen(false); }}
      footer={<div data-plugin-modal="dsh-muzi-creator" className="cardDeleteModalActions">
        <IslandButton disabled={busy} onClick={() => { if (!pending.current) setOpen(false); }}>
          {text("cardDelete.cancel")}
        </IslandButton>
        <IslandButton icon={<WorkbenchIcon name="remove" />} type="primary" danger loading={busy} disabled={disabled || busy}
          onClick={() => { void remove(); }}>
          {text(busy ? "cardDelete.busy" : "cardDelete.label")}
        </IslandButton>
      </div>}
    >
      <div ref={body} data-plugin-modal="dsh-muzi-creator" className="cardDeleteModalBody" aria-busy={busy}>
        <p className="cardDeleteModalTitle">{title}</p>
        <p className="cardDeleteModalHint">{text("cardDelete.keepFiles")}</p>
        {error !== null && <p className="cardDeleteModalError" role="alert">{error}</p>}
      </div>
    </IslandModal>}
  </div>;
}
