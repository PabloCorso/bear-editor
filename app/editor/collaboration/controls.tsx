import { ElmaAvatar } from "./avatar";
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
} from "react";
import type { RefObject, ReactNode } from "react";
import { ShareNetworkIcon, UsersIcon } from "@phosphor-icons/react/dist/ssr";
import { ToolButton } from "~/components/tool-button";
import { useEditor } from "../use-editor-store";

const LazyRoomPanel = lazy(() => import("./room-panel"));
const ControlsContext = createContext<{ enabled: boolean; open: () => void }>({
  enabled: false,
  open: () => {},
});

export function CollaborationControls({
  children,
  canvasRef,
  ready,
}: {
  children: ReactNode;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  ready: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => {
      const invited = new URLSearchParams(location.hash.slice(1)).has("room");
      // Enable for evaluation until real cross-network/Safari checks pass.
      setEnabled(
        invited ||
          import.meta.env.VITE_MULTIPLAYER === "true" ||
          new URLSearchParams(location.search).get("multiplayer") === "1",
      );
      if (invited) {
        setMounted(true);
        setOpen(true);
      }
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);
  const show = () => {
    setMounted(true);
    setOpen(true);
  };
  return (
    <ControlsContext.Provider value={{ enabled: enabled && ready, open: show }}>
      {children}
      {mounted && ready && (
        <Suspense fallback={null}>
          <LazyRoomPanel
            open={open}
            onOpenChange={setOpen}
            canvasRef={canvasRef}
          />
        </Suspense>
      )}
    </ControlsContext.Provider>
  );
}

export function ShareButton() {
  const controls = useContext(ControlsContext);
  const room = useEditor((state) => state.collaboration);
  if (!controls.enabled) return null;
  return (
    <ToolButton
      className="w-auto min-w-10 gap-1.5 px-2 [&>svg]:size-4"
      name={room ? "Shared session" : "Share level"}
      onClick={controls.open}
      aria-label={room ? "Shared session" : "Share level"}
    >
      {room?.participants.length ? (
        <span className="flex -space-x-2">
          {room.participants.slice(0, 3).map((p) => (
            <ElmaAvatar key={p.id} avatar={p.avatar} color={p.color} />
          ))}
        </span>
      ) : room ? (
        <UsersIcon />
      ) : (
        <ShareNetworkIcon />
      )}
      <span className="text-xs">
        {room ? room.participants.length + 1 : "Share"}
      </span>
    </ToolButton>
  );
}
