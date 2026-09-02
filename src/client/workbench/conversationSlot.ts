import type { SidebarTab } from "../persistence.ts";

/** Keeps one central occupant live across feature switches and releases it for sessions. */
export class ConversationWorkbenchController {
  private disposeOccupant: (() => void) | null = null;

  constructor(
    private readonly register: () => () => void,
    private readonly reportError: (message: string | null) => void,
  ) {}

  sync(tab: SidebarTab): void {
    if (tab === "sessions") {
      this.release();
      this.reportError(null);
      return;
    }
    if (this.disposeOccupant !== null) return;
    try {
      this.disposeOccupant = this.register();
      this.reportError(null);
    } catch (cause) {
      this.reportError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  release(): void {
    this.disposeOccupant?.();
    this.disposeOccupant = null;
  }

  dispose(): void {
    this.release();
    this.reportError(null);
  }
}
