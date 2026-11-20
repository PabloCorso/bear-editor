import { createStore } from "zustand/vanilla";

export type HistoryAction<TKind extends string = string> = {
  kind: TKind;
  label: string;
  toolId?: string;
};
export type HistoryEntry<
  T,
  TKind extends string = string,
> = HistoryAction<TKind> & {
  readonly id: string;
  readonly timestamp: number;
  readonly before: T;
  readonly after: T;
};
export type HistoryState<T, TKind extends string = string> = {
  readonly entries: readonly HistoryEntry<T, TKind>[];
  /** Number of applied entries. Zero is the retained initial state. */
  readonly cursor: number;
  readonly active: HistoryAction<TKind> | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
};
export type HistoryTransaction = {
  readonly active: boolean;
  update: <R>(mutate: () => R) => R;
  /** Apply the final input, if any, and capture the completed action once. */
  complete: (finalUpdate?: () => void) => void;
  cancel: () => void;
};

/** History owns immutable snapshots; callers own meaningful edit boundaries. */
export function createTransactionHistory<
  T,
  TKind extends string = string,
>(options: {
  capture: () => T;
  restore: (snapshot: T) => void;
  /** Compare editable content, excluding selection and other context. */
  equal: (a: T, b: T) => boolean;
  prepareRestore?: () => void;
  retain?: (snapshots: readonly T[]) => void;
  limit?: number;
  onCommit?: (before: T, after: T) => void;
}) {
  const limit = Math.max(1, options.limit ?? 200);
  const state = createStore<HistoryState<T, TKind>>(() => ({
    entries: [],
    cursor: 0,
    active: null,
    canUndo: false,
    canRedo: false,
  }));
  let pending: {
    before: T;
    action: HistoryAction<TKind>;
    transaction: HistoryTransaction;
  } | null = null;
  let restoring = false;
  let updateDepth = 0;
  let disposed = false;

  const retain = () => {
    const { entries } = state.getState();
    options.retain?.([
      options.capture(),
      ...entries.flatMap((entry) => [entry.before, entry.after]),
      ...(pending ? [pending.before] : []),
    ]);
  };
  const publish = (
    entries = state.getState().entries,
    cursor = state.getState().cursor,
  ) => {
    state.setState({
      entries,
      cursor,
      active: pending?.action ?? null,
      canUndo: !!pending || cursor > 0,
      canRedo: !pending && cursor < entries.length,
    });
    retain();
  };
  const restore = (snapshot: T) => {
    restoring = true;
    try {
      options.restore(snapshot);
    } finally {
      restoring = false;
    }
  };
  const cancelActive = () => pending?.transaction.cancel();
  const begin = (action: HistoryAction<TKind>): HistoryTransaction => {
    if (disposed) throw new Error("History has been disposed.");
    if (restoring)
      throw new Error("Cannot begin an edit while restoring history.");
    if (pending)
      throw new Error(
        `Cannot start "${action.label}" while "${pending.action.label}" is active. ` +
          "User actions cannot nest; compose domain mutations through the active transaction.",
      );
    const before = options.capture();
    const transaction: HistoryTransaction = {
      get active() {
        return pending?.transaction === transaction;
      },
      update: (mutate) => {
        if (!transaction.active)
          throw new Error("This edit has already ended.");
        updateDepth += 1;
        try {
          const result = mutate();
          if (
            result &&
            typeof (result as { then?: unknown }).then === "function"
          ) {
            throw new Error(
              "History edits must be synchronous. Await work before execute().",
            );
          }
          return result;
        } catch (error) {
          transaction.cancel();
          throw error;
        } finally {
          updateDepth -= 1;
        }
      },
      complete: (finalUpdate) => {
        if (!transaction.active) return;
        if (finalUpdate) transaction.update(finalUpdate);
        const after = options.capture();
        pending = null;
        if (options.equal(before, after)) {
          // Selection-only changes and no-op edits preserve the redo branch.
          publish();
          return;
        }
        const { entries, cursor } = state.getState();
        const next = [
          ...entries.slice(0, cursor),
          {
            ...action,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            before,
            after,
          },
        ].slice(-limit);
        publish(next, next.length);
        options.onCommit?.(before, after);
      },
      cancel: () => {
        if (!transaction.active) return;
        // Include resources created during a failed/live edit before rollback.
        retain();
        pending = null;
        restore(before);
        publish();
      },
    };
    pending = { before, action, transaction };
    publish();
    return transaction;
  };
  const execute = <R>(action: HistoryAction<TKind>, mutate: () => R): R => {
    if (restoring) return mutate();
    if (pending && updateDepth > 0)
      throw new Error(
        `Cannot start "${action.label}" while "${pending.action.label}" is active. ` +
          "User actions cannot nest; compose domain mutations through the active transaction.",
      );
    if (pending) {
      // A separate UI action supersedes an unfinished gesture. Let the tool
      // clear its private interaction state before rolling its content back.
      options.prepareRestore?.();
      cancelActive();
    }
    const transaction = begin(action);
    const result = transaction.update(mutate);
    transaction.complete();
    return result;
  };
  /**
   * Record one domain mutation. It joins the owning user action when one is
   * active, or uses the supplied fallback action when called on its own.
   */
  const record = <R>(action: HistoryAction<TKind>, mutate: () => R): R => {
    if (restoring) return mutate();
    if (pending) return pending.transaction.update(mutate);
    return execute(action, mutate);
  };
  const navigate = (cursor: number, target?: T) => {
    const { entries } = state.getState();
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > entries.length) {
      options.prepareRestore?.();
      return;
    }
    if (cursor === state.getState().cursor) return;
    options.prepareRestore?.();
    const snapshot =
      target ??
      (cursor === 0 ? entries[0]?.before : entries[cursor - 1]?.after);
    if (!snapshot) return;
    restore(snapshot);
    publish(entries, cursor);
  };
  return {
    state,
    begin,
    execute,
    record,
    cancelActive,
    undo: () => {
      if (pending) {
        const before = pending.before;
        options.prepareRestore?.();
        cancelActive();
        restore(before);
        return;
      }
      const { entries, cursor } = state.getState();
      navigate(cursor - 1, entries[cursor - 1]?.before);
    },
    redo: () => {
      if (pending) {
        const before = pending.before;
        options.prepareRestore?.();
        cancelActive();
        restore(before);
        return;
      }
      navigate(state.getState().cursor + 1);
    },
    clear: () => {
      cancelActive();
      publish([], 0);
    },
    dispose: () => {
      cancelActive();
      disposed = true;
      state.setState({
        entries: [],
        cursor: 0,
        active: null,
        canUndo: false,
        canRedo: false,
      });
      options.retain?.([]);
    },
  };
}
