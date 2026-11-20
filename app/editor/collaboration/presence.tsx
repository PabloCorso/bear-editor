import { getRideView } from "./ride-view";
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { Button } from "~/components/ui/button";
import { useEditor, useEditorStore } from "../use-editor-store";
import type { RoomSession } from "./session";
import type { Participant } from "./types";

type Cursor = { id: number; x: number; y: number; color: string; name: string };
export function RoomPresence({
  session,
  canvasRef,
}: {
  session: RoomSession;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  const store = useEditorStore();
  const following = useEditor((state) => state.collaboration?.following);
  const participants = useEditor((state) => state.collaboration?.participants);
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const followed = participants?.find((p) => p.id === following);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let applyingCamera = false;
    const stop = () => {
      if (store.getState().collaboration?.following !== undefined)
        session.follow();
    };
    const key = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        store.getState().collaboration?.following !== undefined
      ) {
        stop();
        event.preventDefault();
        event.stopPropagation();
      }
    };
    canvas.addEventListener("pointerdown", stop, true);
    canvas.addEventListener("wheel", stop, true);
    window.addEventListener("keydown", key, true);
    const unsubscribe = store.subscribe((state, previous) => {
      if (
        !applyingCamera &&
        (state.zoom !== previous.zoom ||
          state.viewPortOffset !== previous.viewPortOffset ||
          state.isPlayMode !== previous.isPlayMode)
      )
        stop();
    });
    const tick = () => {
      const rect = canvas.getBoundingClientRect();
      const state = store.getState();
      const room = state.collaboration;
      if (!room) return;
      const target = room.participants.find((p) => p.id === room.following);
      if (target) {
        if (
          target.following !== undefined ||
          !target.camera ||
          state.isPlayMode
        )
          stop();
        else {
          applyingCamera = true;
          store.setState({
            zoom: target.camera.zoom,
            viewPortOffset: {
              x: rect.width / 2 - target.camera.center.x * target.camera.zoom,
              y: rect.height / 2 - target.camera.center.y * target.camera.zoom,
            },
          });
          applyingCamera = false;
        }
      }
      const current = store.getState();
      const camera: Participant["camera"] = {
        center: {
          x: (rect.width / 2 - current.viewPortOffset.x) / current.zoom,
          y: (rect.height / 2 - current.viewPortOffset.y) / current.zoom,
        },
        zoom: current.zoom,
      };
      session.publishView({
        mode: current.isPlayMode ? "riding" : "editing",
        following: room.following,
        camera:
          room.following !== undefined
            ? undefined
            : current.isPlayMode
              ? getRideView(store)
              : camera,
        cursor:
          current.mouseOnCanvas && !current.isPlayMode
            ? current.mousePosition
            : undefined,
      });
      setCursors(
        current.isPlayMode
          ? []
          : room.participants.flatMap((p) => {
              if (!p.cursor || p.mode !== "editing") return [];
              const x = p.cursor.x * current.zoom + current.viewPortOffset.x;
              const y = p.cursor.y * current.zoom + current.viewPortOffset.y;
              return x >= 0 && y >= 0 && x < rect.width && y < rect.height
                ? [
                    {
                      id: p.id,
                      name: p.name,
                      color: p.color,
                      x: rect.left + x,
                      y: rect.top + y,
                    },
                  ]
                : [];
            }),
      );
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => {
      clearInterval(interval);
      unsubscribe();
      canvas.removeEventListener("pointerdown", stop, true);
      canvas.removeEventListener("wheel", stop, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [canvasRef, session, store]);
  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-30 overflow-hidden"
        aria-hidden
      >
        {cursors.map((cursor) => (
          <div
            key={cursor.id}
            className="absolute flex items-start gap-1"
            style={{
              transform: `translate(${cursor.x}px, ${cursor.y}px)`,
              color: cursor.color,
            }}
          >
            <svg width="14" height="20" viewBox="0 0 14 20">
              <path
                d="M1 1 L1 16 L5 12 L8 19 L11 17 L8 11 L13 10 Z"
                fill="currentColor"
                stroke="#172135"
              />
            </svg>
            <span className="rounded bg-screen px-1 py-0.5 text-xs shadow">
              {cursor.name}
            </span>
          </div>
        ))}
      </div>
      {followed && (
        <div className="absolute top-20 right-4 z-40 flex items-center gap-2 rounded-lg border border-default bg-screen p-2 text-xs">
          <span>Following {followed.name}</span>
          <Button size="sm" onClick={() => session.follow()}>
            Stop following
          </Button>
        </div>
      )}
    </>
  );
}
