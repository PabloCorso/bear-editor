import { ElmaLGR } from "../editor/elma-types";
import { decodeLgrSpritePixels } from "../editor/helpers/pcx-loader";

type WorkerRequest = {
  data: ArrayBuffer;
};

export type DecodedLgrSprite = {
  name: string;
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
};

type WorkerSuccessResponse = {
  type: "success";
  sprites: DecodedLgrSprite[];
};

type WorkerErrorResponse = {
  type: "error";
  message: string;
};

export type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;

self.addEventListener("message", function handleDecodeLgrMessage(event) {
  const { data } = event.data as WorkerRequest;

  try {
    const lgr = ElmaLGR.from(new Uint8Array(data));
    const declarations = new Map(
      lgr.pictureList.map((declaration) => [
        normalizeName(declaration.name),
        declaration,
      ]),
    );
    const sprites: DecodedLgrSprite[] = [];
    const transfers: Transferable[] = [];

    for (const picture of lgr.pictureData) {
      const name = normalizeName(picture.name);
      if (sprites.some((sprite) => sprite.name === name)) continue;

      const declaration = declarations.get(name);
      const decoded = decodeLgrSpritePixels(picture, declaration);
      sprites.push({
        name,
        pixels: decoded.pixels,
        width: decoded.width,
        height: decoded.height,
      });
      transfers.push(decoded.pixels.buffer);
    }

    self.postMessage({ type: "success", sprites } satisfies WorkerResponse, {
      transfer: transfers,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    } satisfies WorkerResponse);
  }
});

function normalizeName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.pcx$/, "");
}
