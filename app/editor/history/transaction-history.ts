import { createStore } from "zustand/vanilla";

export type HistoryAction = { label: string; toolId?: string };
export type HistoryEntry<T> = HistoryAction & {
  readonly id: string;
  readonly timestamp: number;
  readonly before: T;
  readonly after: T;
};
export type HistoryState<T> = {
  readonly entries: readonly HistoryEntry<T>[];
  /** Number of applied entries. Zero is the retained initial state. */
  readonly cursor: number;
  readonly active: HistoryAction | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
};
export type HistoryTransaction = {
  readonly active: boolean;
  update: <R>(mutate: () => R) => R;
  commit: () => void;
  cancel: () => void;
};

/** History owns immutable snapshots; callers own meaningful edit boundaries. */
export function createTransactionHistory<T>(options: {
  capture: () => T;
  restore: (snapshot: T) => void;
  /** Compare editable content, excluding selection and other context. */
  equal: (a: T, b: T) => boolean;
  prepareRestore?: () => void;
  retain?: (snapshots: readonly T[]) => void;
  limit?: number;
}) {
  const limit = Math.max(1, options.limit ?? 200);
  const state = createStore<HistoryState<T>>(() => ({
    entries: [],
    cursor: 0,
    active: null,
    canUndo: false,
    canRedo: false,
  }));
  let pending: {
    before: T;
    action: HistoryAction;
    transaction: HistoryTransaction;
  } | null = null;
  let restoring = false;
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
  const begin = (action: HistoryAction): HistoryTransaction => {
    if (disposed) throw new Error("History has been disposed.");
    if (restoring)
      throw new Error("Cannot begin an edit while restoring history.");
    if (pending)
      throw new Error(
        "An edit is already active. Use execute() to compose edits.",
      );
    const before = options.capture();
    const transaction: HistoryTransaction = {
      get active() {
        return pending?.transaction === transaction;
      },
      update: (mutate) => {
        if (!transaction.active)
          throw new Error("This edit has already ended.");
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
        }
      },
      commit: () => {
        if (!transaction.active) return;
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
  const execute = <R>(action: HistoryAction, mutate: () => R): R => {
    if (restoring) return mutate();
    if (pending) return pending.transaction.update(mutate);
    const transaction = begin(action);
    const result = transaction.update(mutate);
    transaction.commit();
    return result;
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
    /** null selects the initial retained state. IDs survive history trimming. */
    goTo: (id: string | null) => {
      const cursor =
        id === null
          ? 0
          : state.getState().entries.findIndex((entry) => entry.id === id) + 1;
      if (id !== null && cursor === 0) return;
      if (pending) {
        const before = pending.before;
        options.prepareRestore?.();
        cancelActive();
        restore(before);
      }
      navigate(cursor);
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
