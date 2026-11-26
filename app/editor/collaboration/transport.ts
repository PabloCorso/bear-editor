import { WebrtcProvider } from "y-webrtc";
import type { RoomDocument } from "./document";

export function createInvite() {
  return `${crypto.randomUUID()}.${crypto.randomUUID()}`;
}
export function parseInvite(value: string | null): string | null {
  return value && /^[a-f0-9-]{36}\.[a-f0-9-]{36}$/.test(value) ? value : null;
}
export function inviteFromLocation() {
  return parseInvite(new URLSearchParams(location.hash.slice(1)).get("room"));
}
export function inviteUrl(invite: string) {
  const url = new URL(location.href);
  url.hash = new URLSearchParams({ room: invite }).toString();
  return url.toString();
}
export function createTransport(room: RoomDocument, invite: string) {
  if (!parseInvite(invite)) throw new Error("This session link is invalid.");
  const [name, password] = invite.split(".");
  return new WebrtcProvider(`bear-editor-v1-${name}`, room.doc, {
    password,
    maxConns: 5,
    // No TURN subscription or hosted database. Public signaling only introduces
    // peers; the invitation secret encrypts signaling and stays in the fragment.
    peerOpts: {
      config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
    },
  });
}
