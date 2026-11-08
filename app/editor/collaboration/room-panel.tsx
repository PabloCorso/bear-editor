import { ElmaAvatar } from "./avatar";
import { RoomPresence } from "./presence";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { useEditor, useEditorStore } from "../use-editor-store";
import { downloadLevel } from "../helpers/download-level";
import { elmaLevelFromEditorState } from "../helpers/level-parser";
import { useEditorDocumentGuard } from "../session/document-guard";
import { createInvite, inviteFromLocation, parseInvite } from "./transport";
import { RoomSession } from "./session";
import type { Avatar, CollaborationState } from "./types";

const statuses: Record<CollaborationState["status"], string> = {
  connecting: "Connecting…",
  active: "Session active",
  waiting: "Waiting for friends",
  reconnecting: "Reconnecting…",
  offline: "Offline",
  error: "Sync paused",
};

export default function RoomPanel({
  open,
  onOpenChange,
  canvasRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  const store = useEditorStore();
  const room = useEditor((state) => state.collaboration);
  const documentSession = useEditor((state) => state.documentSession);
  const { confirmDiscardChanges } = useEditorDocumentGuard();
  const sessionRef = useRef<RoomSession | null>(null);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("bear-room-name") ?? "";
    } catch {
      return "";
    }
  });
  const [avatar, setAvatar] = useState<Avatar>("rider");
  const [invite, setInvite] = useState<string | null>(inviteFromLocation);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  useEffect(
    () => () => {
      sessionRef.current?.leave();
      sessionRef.current = null;
    },
    [],
  );
  useEffect(() => {
    const changed = () => {
      if (!sessionRef.current) setInvite(inviteFromLocation());
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  const start = () => {
    setError(undefined);
    try {
      const rawInvite = new URLSearchParams(location.hash.slice(1)).get("room");
      if (rawInvite && !parseInvite(rawInvite))
        throw new Error("This session link is invalid.");
      const key = invite ?? createInvite();
      if (!parseInvite(key)) throw new Error("This session link is invalid.");
      sessionRef.current = new RoomSession(
        store,
        key,
        { name, avatar },
        !invite,
      );
      try {
        localStorage.setItem("bear-room-name", name.trim());
      } catch {
        /* Private browsing may disable storage. */
      }
      history.replaceState(history.state, "", sessionRef.current.url);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not start the session.",
      );
    }
  };
  const leave = async (restore = false) => {
    if (restore && room?.initialized && !(await confirmDiscardChanges()))
      return;
    sessionRef.current?.leave(restore);
    sessionRef.current = null;
    setInvite(null);
    onOpenChange(false);
  };
  const save = (previous = false) => {
    try {
      const state = previous ? sessionRef.current?.previous : store.getState();
      if (state) downloadLevel(elmaLevelFromEditorState(state));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not export this level.",
      );
    }
  };
  return (
    <>
      {room?.initialized && sessionRef.current && (
        <RoomPresence session={sessionRef.current} canvasRef={canvasRef} />
      )}
      {room &&
        (room.message ||
          room.status === "offline" ||
          room.status === "reconnecting") &&
        !open && (
          <div
            role="status"
            className="absolute right-4 bottom-16 z-40 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-lg border border-default bg-screen p-3 text-xs shadow-lg"
          >
            <span>{room.message ?? "Connection lost. Editing is paused."}</span>
            <Button size="sm" onClick={() => onOpenChange(true)}>
              Session
            </Button>
          </div>
        )}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader showCloseButton>
            <DialogTitle>
              {room
                ? "Shared session"
                : invite
                  ? "Join session"
                  : "Share level"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>
              Experimental sessions for a few friends. Everyone with the link
              can edit and forward it. The link stops working after everyone
              leaves.
            </DialogDescription>
            {!room ? (
              <>
                <label className="mt-2 flex flex-col gap-1 text-xs">
                  Display name
                  <Input
                    maxLength={24}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Rider"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Avatar
                  <select
                    className="rounded border border-default bg-screen p-2"
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value as Avatar)}
                  >
                    <option value="rider">Rider</option>
                    <option value="apple">Apple</option>
                    <option value="flower">Flower</option>
                    <option value="killer">Killer</option>
                  </select>
                </label>
                {invite && (
                  <p className="text-xs opacity-70">
                    Your current level stays available in this tab. Export it
                    before closing the tab.
                  </p>
                )}
                {invite && (
                  <Button size="sm" onClick={() => save()}>
                    Export current level
                  </Button>
                )}
              </>
            ) : (
              <>
                <p role="status" className="mt-2 text-sm font-medium">
                  {statuses[room.status]}
                </p>
                {documentSession.lastSavedAt && (
                  <p className="text-xs opacity-70">
                    Saved to file on this device
                  </p>
                )}
                {room.status === "offline" && (
                  <p className="text-xs">
                    No peer is reachable. Keep this tab open to reconnect, or
                    continue solo with your local copy. An empty session cannot
                    be recovered from its link.
                  </p>
                )}
                {room.initialized && (
                  <>
                    <div
                      className="flex flex-col gap-2"
                      aria-label="Participants"
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <ElmaAvatar avatar={avatar} />
                        <span>{name.trim() || "Rider"} (you)</span>
                      </div>
                      {room.participants.map((person) => (
                        <div
                          key={person.id}
                          className="flex items-center gap-2 text-xs"
                        >
                          <ElmaAvatar
                            avatar={person.avatar}
                            color={person.color}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {person.name}
                            <span className="ml-2 opacity-60">
                              {person.mode === "riding" ? "Riding" : "Editing"}
                            </span>
                          </span>
                          <Button
                            size="sm"
                            disabled={
                              !person.camera || person.following !== undefined
                            }
                            onClick={() => {
                              store.getState().actions.stopPlayMode();
                              sessionRef.current?.follow(person.id);
                              onOpenChange(false);
                            }}
                          >
                            Follow camera
                          </Button>
                        </div>
                      ))}
                    </div>
                    <label className="flex flex-col gap-1 text-xs">
                      Invite link
                      <Input
                        value={sessionRef.current?.url ?? ""}
                        readOnly
                        onFocus={(e) => e.target.select()}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              sessionRef.current!.url,
                            );
                            setCopied(true);
                          } catch {
                            setError(
                              "Copy the invite link from the field above.",
                            );
                          }
                        }}
                      >
                        {copied ? "Copied" : "Copy link"}
                      </Button>
                      <Button size="sm" onClick={() => save()}>
                        Export session level
                      </Button>
                    </div>
                    <p className="text-xs opacity-70">
                      Undo, redo, and advanced polygon operations are available
                      in solo mode. Export a copy to keep the level.
                    </p>
                  </>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => save(true)}>
                    Export previous level
                  </Button>
                  <Button size="sm" onClick={() => void leave(true)}>
                    Return to previous level
                  </Button>
                </div>
              </>
            )}
            {(error || room?.message) && (
              <p role="alert" className="text-sm text-amber-500">
                {error ?? room?.message}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            {room ? (
              <Button size="sm" variant="accent" onClick={() => void leave()}>
                {room.initialized ? "Continue solo" : "Cancel join"}
              </Button>
            ) : (
              <Button size="sm" variant="accent" onClick={start}>
                {invite ? "Join session" : "Start session"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
