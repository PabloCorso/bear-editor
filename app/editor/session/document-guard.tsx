import { useBeforeUnload, useBlocker } from "react-router";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useEditorDocumentSession } from "~/editor/use-editor-store";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";

type PendingConfirmation = {
  onConfirm: () => void;
  onCancel: () => void;
};

type EditorDocumentGuardContextValue = {
  confirmDiscardChanges: () => Promise<boolean>;
};

const EditorDocumentGuardContext =
  createContext<EditorDocumentGuardContextValue | null>(null);

export function EditorDocumentGuardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const documentSession = useEditorDocumentSession();
  const isDirty = documentSession.dirty;
  const blocker = useBlocker(isDirty);
  const [pendingActionConfirmation, setPendingActionConfirmation] =
    useState<PendingConfirmation | null>(null);

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!isDirty) return;
        event.preventDefault();
        event.returnValue = "";
      },
      [isDirty],
    ),
  );

  const pendingBlockerConfirmation = useMemo(
    () =>
      blocker.state === "blocked"
        ? {
            onConfirm: () => blocker.proceed(),
            onCancel: () => blocker.reset(),
          }
        : null,
    [blocker],
  );

  const pendingConfirmation =
    pendingActionConfirmation ?? pendingBlockerConfirmation;

  const closeDialog = useCallback(() => {
    if (!pendingActionConfirmation && pendingBlockerConfirmation) {
      pendingBlockerConfirmation.onCancel();
      return;
    }

    setPendingActionConfirmation((current) => {
      current?.onCancel();
      return null;
    });
  }, [pendingActionConfirmation, pendingBlockerConfirmation]);

  const confirmDiscardChanges = useCallback(() => {
    if (!isDirty) return Promise.resolve(true);

    return new Promise<boolean>((resolve) => {
      setPendingActionConfirmation({
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }, [isDirty]);

  const handleDiscard = useCallback(() => {
    if (!pendingActionConfirmation && pendingBlockerConfirmation) {
      pendingBlockerConfirmation.onConfirm();
      return;
    }

    setPendingActionConfirmation((current) => {
      current?.onConfirm();
      return null;
    });
  }, [pendingActionConfirmation, pendingBlockerConfirmation]);

  const handleCancel = useCallback(() => {
    if (!pendingActionConfirmation && pendingBlockerConfirmation) {
      pendingBlockerConfirmation.onCancel();
      return;
    }

    setPendingActionConfirmation((current) => {
      current?.onCancel();
      return null;
    });
  }, [pendingActionConfirmation, pendingBlockerConfirmation]);

  const value = useMemo(
    () => ({ confirmDiscardChanges }),
    [confirmDiscardChanges],
  );

  return (
    <EditorDocumentGuardContext.Provider value={value}>
      {children}
      <Dialog
        open={Boolean(pendingConfirmation)}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>
              You have unsaved changes. If you continue, those edits will be
              lost.
            </DialogDescription>
          </DialogBody>
          <DialogFooter>
            <Button size="sm" onClick={handleCancel}>
              Keep editing
            </Button>
            <Button size="sm" variant="accent" onClick={handleDiscard}>
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </EditorDocumentGuardContext.Provider>
  );
}

export function useEditorDocumentGuard() {
  const context = useContext(EditorDocumentGuardContext);
  if (!context) {
    throw new Error(
      "useEditorDocumentGuard must be used within <EditorDocumentGuardProvider />",
    );
  }
  return context;
}
