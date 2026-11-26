import type { EditorStore } from "../editor-store";
import { getLevelSnapshot } from "../editor-store";
import type { EditorLevel } from "../elma-types";
import type { SelectToolState } from "../edit-mode/tools/select-tool";
import { FileSession } from "../helpers/file-session";
import { emptyTestStarts } from "../test-starts";
import { RoomDocument, LOCAL_EDIT } from "./document";
import { getRoomId, identify } from "./identity";
import { createTransport, inviteUrl } from "./transport";
import type { Avatar, CollaborationState, Participant } from "./types";
import type { EditorHistoryActionKind } from "../history/editor-history-actions";

const unsupported = new Set<EditorHistoryActionKind>([
  "polygon.smooth",
  "polygon.cut-connect",
  "polygon.create-frame",
  "polygon.union",
  "polygon.subtract",
  "polygon.intersect",
  "polygon.exclude",
  "topology.repair",
]);
const colors = [
  "#f7a652",
  "#62d7c6",
  "#b29cff",
  "#f68ab1",
  "#89c96c",
  "#72b9ff",
];
const avatars = new Set(["rider", "apple", "flower", "killer"]);

export class RoomSession {
  readonly document = new RoomDocument();
  readonly provider: ReturnType<typeof createTransport>;
  readonly previous: ReturnType<EditorStore["getState"]>;
  private disposers: (() => void)[] = [];
  private timer: ReturnType<typeof setInterval>;
  private startedAt = Date.now();
  private lastPeerAt = Date.now();
  private hadPeers = false;
  private loaded = false;
  private stopped = false;
  private applying = false;
  private queued = false;
  private remotePending = false;
  private lastPresence = "";
  private lastPresenceAt = 0;
  private awarenessSeen = new Map<number, number>();

  constructor(
    readonly store: EditorStore,
    readonly invite: string,
    profile: { name: string; avatar: Avatar },
    create: boolean,
  ) {
    store.getState().actions.getActiveTool()?.cancelInteraction();
    store.history.cancelActive();
    this.previous = store.getState();
    if (create)
      this.document.seed(structuredClone(getLevelSnapshot(this.previous)));
    try {
      this.provider = createTransport(this.document, invite);
    } catch (error) {
      this.document.doc.destroy();
      throw error;
    }
    store.setState({
      collaboration: {
        status: "connecting",
        initialized: false,
        invite,
        participants: [],
      },
    });
    // Keep the previous document and its file handle untouched until initial
    // sync has supplied a valid initialized document. Guests never seed.
    store.history.setCollaborationBridge({
      referenceImages: this.previous.referenceImages,
      onUndoBlocked: () =>
        this.patch({ message: "Undo and redo are available in solo mode." }),
      allowEdit: (action) => {
        const personal =
          action.kind.startsWith("reference-image.") ||
          (action.kind.startsWith("test-start.") &&
            action.kind !== "test-start.promote");
        if (personal) return true;
        const status = store.getState().collaboration?.status;
        if (!this.loaded || (status !== "active" && status !== "waiting")) {
          this.patch({
            message:
              "Editing is paused. Reconnect or continue solo to keep working.",
          });
          return false;
        }
        if (unsupported.has(action.kind)) {
          this.patch({
            message:
              "This polygon operation is available in solo mode. Continue solo to use it.",
          });
          return false;
        }
        this.patch({ following: undefined });
        return true;
      },
      commit: (before, after) => {
        if (this.applying || !this.loaded) return;
        try {
          this.document.commit(before, after);
          identify(after.start, "start");
          for (const apple of after.apples)
            identify(apple.position, getRoomId(apple)!);
          for (const picture of after.pictures)
            identify(picture.position, getRoomId(picture)!);
          if (this.remotePending) this.scheduleApply();
        } catch (error) {
          // Keep the rejected local edit visible for export/recovery. Never send
          // it to peers or silently replace it with a remote snapshot.
          this.fail(error);
        }
      },
    });
    this.provider.awareness.setLocalStateField("person", {
      name: profile.name.trim().slice(0, 24) || "Rider",
      avatar: profile.avatar,
      color: colors[this.document.doc.clientID % colors.length],
    });
    const update = (_update: Uint8Array, origin: unknown) => {
      if (origin !== LOCAL_EDIT) {
        this.remotePending = true;
        this.scheduleApply();
      }
    };
    this.document.doc.on("update", update);
    this.disposers.push(() => this.document.doc.off("update", update));
    this.disposers.push(
      store.history.state.subscribe((state, previous) => {
        if (previous.active && !state.active && this.remotePending)
          this.scheduleApply();
      }),
    );
    const awareness = ({
      added,
      updated,
      removed,
    }: {
      added: number[];
      updated: number[];
      removed: number[];
    }) => {
      for (const id of [...added, ...updated])
        this.awarenessSeen.set(id, Date.now());
      for (const id of removed) this.awarenessSeen.delete(id);
      this.updateParticipants();
    };
    this.provider.awareness.on("update", awareness);
    this.disposers.push(() => this.provider.awareness.off("update", awareness));
    const offline = () => this.refreshStatus();
    window.addEventListener("offline", offline);
    window.addEventListener("online", offline);
    this.disposers.push(() => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", offline);
    });
    this.timer = setInterval(() => {
      this.refreshStatus();
      this.updateParticipants();
    }, 1000);
    if (create) this.apply();
    this.refreshStatus();
  }

  private patch(patch: Partial<CollaborationState>) {
    const state = this.store.getState().collaboration;
    if (state && !this.stopped)
      this.store.setState({ collaboration: { ...state, ...patch } });
  }

  private scheduleApply() {
    if (this.queued || this.stopped) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.apply();
    });
  }

  private apply() {
    if (
      this.stopped ||
      this.applying ||
      !this.document.initialized ||
      this.store.getState().collaboration?.status === "error"
    )
      return;
    try {
      const level = this.document.read();
      const active = this.store.history.state.getState().active;
      if (active) {
        const nextIds = collectIds(level);
        const removed = [
          ...collectIds(getLevelSnapshot(this.store.getState())),
        ].some((id) => !nextIds.has(id));
        if (!removed) return; // Merge this author's finished gesture by stable ID.
        this.applying = true;
        this.store.getState().actions.getActiveTool()?.cancelInteraction();
        this.store.history.cancelActive();
        this.patch({
          message:
            "The shared geometry changed. Your unfinished edit was cancelled.",
        });
        this.applying = false;
      }
      this.applying = true;
      if (!this.loaded) {
        this.store.setState({
          fileSession: new FileSession(this.store),
          testStarts: emptyTestStarts(),
          referenceImages: this.previous.referenceImages,
          isPlayMode: false,
          documentSession: {
            ...this.previous.documentSession,
            clipboardSessionId: crypto.randomUUID(),
            baselineLevel: level,
            origin: {
              kind: "workspace",
              label: "Shared session",
              canOverwrite: false,
            },
            displayName: level.levelName,
            hasExternalHandle: false,
            lastSavedAt: undefined,
            pendingRecovery: true,
          },
        });
        this.loaded = true;
        this.store.history.clear();
        this.patch({ initialized: true });
      } else if (
        this.remotePending &&
        this.store.getState().actions.getActiveTool()?.isInteracting?.()
      ) {
        this.store.getState().actions.getActiveTool()?.cancelInteraction();
        this.patch({
          message:
            "The shared level changed. Your drawing preview was cancelled.",
        });
      }
      const selection = this.store.getState().toolState.select as
        | SelectToolState
        | undefined;
      const selectedVertices = new Set(
        selection?.selectedVertices?.map(({ vertex }) => getRoomId(vertex)),
      );
      const selectedObjects = new Set(
        selection?.selectedObjects?.map(getRoomId),
      );
      const selectedPictures = new Set(
        selection?.selectedPictures?.map(getRoomId),
      );
      identify(level.start, "start");
      for (const apple of level.apples)
        identify(apple.position, getRoomId(apple)!);
      for (const picture of level.pictures)
        identify(picture.position, getRoomId(picture)!);
      this.store.setState((state) => ({
        ...level,
        topologyInspection: null,
        toolState: {
          ...state.toolState,
          select: {
            ...selection,
            selectedVertices: level.polygons.flatMap((polygon) =>
              polygon.vertices
                .filter((v) => selectedVertices.has(getRoomId(v)))
                .map((vertex) => ({ polygon, vertex })),
            ),
            selectedObjects: [
              level.start,
              ...level.apples.map((a) => a.position),
              ...level.killers,
              ...level.flowers,
            ].filter((v) => selectedObjects.has(getRoomId(v))),
            selectedPictures: level.pictures
              .map((p) => p.position)
              .filter((v) => selectedPictures.has(getRoomId(v))),
            hoveredObject: undefined,
            hoveredPictureBounds: undefined,
          },
        },
      }));
      this.remotePending = false;
      this.refreshStatus();
    } catch (error) {
      this.fail(error);
    } finally {
      this.applying = false;
    }
  }

  private fail(error: unknown) {
    this.patch({
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "The session could not sync. Continue solo to keep this copy.",
    });
    this.provider.disconnect();
  }

  private refreshStatus() {
    if (this.stopped || this.store.getState().collaboration?.status === "error")
      return;
    const room = this.provider.room;
    // provider.connected means "searching", not an established peer connection.
    const peers = room
      ? [...room.webrtcConns.values()].filter((peer) => peer.connected).length +
        room.bcConns.size
      : 0;
    if (peers) {
      this.hadPeers = true;
      this.lastPeerAt = Date.now();
    }
    let status: CollaborationState["status"];
    if (!navigator.onLine) status = "offline";
    else if (peers && this.loaded) status = "active";
    else if (this.loaded && !this.hadPeers) status = "waiting";
    else if (
      Date.now() - (this.hadPeers ? this.lastPeerAt : this.startedAt) >
      20000
    )
      status = "offline";
    else status = this.loaded ? "reconnecting" : "connecting";
    if (this.store.getState().collaboration?.status !== status) {
      if (status === "offline" || status === "reconnecting") {
        this.store.getState().actions.getActiveTool()?.cancelInteraction();
        this.store.history.cancelActive();
      }
      this.patch({
        status,
        ...(status === "active" ? { message: undefined } : {}),
      });
    }
  }

  private updateParticipants() {
    const participants: Participant[] = [];
    for (const [id, value] of this.provider.awareness.getStates()) {
      if (
        id === this.document.doc.clientID ||
        Date.now() - (this.awarenessSeen.get(id) ?? 0) > 30000
      )
        continue;
      const p = value.person;
      const view = value.view;
      if (!p || typeof p.name !== "string" || !avatars.has(p.avatar)) continue;
      const participant: Participant = {
        id,
        name: p.name.slice(0, 24),
        avatar: p.avatar,
        color: colors[id % colors.length],
        mode: view?.mode === "riding" ? "riding" : "editing",
      };
      if (validPoint(view?.cursor)) participant.cursor = view.cursor;
      if (
        validPoint(view?.camera?.center) &&
        Number.isFinite(view.camera.zoom) &&
        view.camera.zoom > 0 &&
        view.camera.zoom < 10000
      )
        participant.camera = view.camera;
      if (Number.isInteger(view?.following))
        participant.following = view.following;
      participants.push(participant);
    }
    participants.sort((a, b) => a.id - b.id);
    const following = this.store.getState().collaboration?.following;
    this.patch({
      participants,
      ...(!participants.some((p) => p.id === following)
        ? { following: undefined }
        : {}),
    });
  }

  publishView(view: Omit<Participant, "id" | "name" | "avatar" | "color">) {
    if (this.stopped || !this.loaded) return;
    const serialized = JSON.stringify(view);
    if (
      serialized !== this.lastPresence ||
      Date.now() - this.lastPresenceAt > 5000
    ) {
      this.lastPresenceAt = Date.now();
      this.lastPresence = serialized;
      this.provider.awareness.setLocalStateField("view", view);
    }
  }
  follow(id?: number) {
    this.patch({ following: id });
  }
  clearMessage() {
    this.patch({ message: undefined });
  }
  get url() {
    return inviteUrl(this.invite);
  }

  leave(restorePrevious = false) {
    if (this.stopped) return;
    this.store.getState().actions.getActiveTool()?.cancelInteraction();
    this.store.history.cancelActive();
    this.stopped = true;
    clearInterval(this.timer);
    for (const dispose of this.disposers) dispose();
    this.provider.awareness.setLocalState(null);
    this.provider.destroy();
    this.document.doc.destroy();
    this.store.history.setCollaborationBridge();
    this.store.setState({ collaboration: undefined });
    if (restorePrevious || !this.loaded) {
      const { fileSession, documentSession, testStarts, referenceImages } =
        this.previous;
      this.store.setState({
        ...getLevelSnapshot(this.previous),
        fileSession,
        documentSession,
        testStarts,
        referenceImages,
        isPlayMode: false,
      });
    }
    this.store.getState().actions.getActiveTool()?.clear?.();
    this.store.getState().actions.setToolState("select", {
      selectedVertices: [],
      selectedObjects: [],
      selectedPictures: [],
    });
    this.store.history.clear();
    if (location.hash.includes("room="))
      history.replaceState(
        history.state,
        "",
        location.pathname + location.search,
      );
  }
}
function collectIds(level: EditorLevel) {
  return new Set(
    [
      ...level.polygons.flatMap((p) => [p, ...p.vertices]),
      ...level.apples,
      ...level.killers,
      ...level.flowers,
      ...level.pictures,
    ]
      .map(getRoomId)
      .filter((id): id is string => !!id),
  );
}
function validPoint(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== "object") return false;
  const p = value as { x: number; y: number };
  return (
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Math.abs(p.x) < 1e9 &&
    Math.abs(p.y) < 1e9
  );
}
