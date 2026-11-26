import type { EditorLevel, Position } from "../elma-types";
import type { EditorHistoryAction } from "../history/editor-history-actions";

export type Avatar = "rider" | "apple" | "flower" | "killer";
export type Participant = {
  id: number;
  name: string;
  avatar: Avatar;
  color: string;
  cursor?: Position;
  camera?: { center: Position; zoom: number };
  mode: "editing" | "riding";
  following?: number;
};
export type CollaborationState = {
  status:
    | "connecting"
    | "active"
    | "waiting"
    | "reconnecting"
    | "offline"
    | "error";
  initialized: boolean;
  invite: string;
  message?: string;
  participants: Participant[];
  following?: number;
};
export type CollaborationHistoryBridge = {
  referenceImages: import("../reference-images").ReferenceImage[];
  onUndoBlocked: () => void;
  allowEdit: (action: EditorHistoryAction) => boolean;
  commit: (before: EditorLevel, after: EditorLevel) => void;
};
