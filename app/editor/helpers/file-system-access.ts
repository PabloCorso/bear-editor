export async function getFileHandle(options?: {
  startIn?: FileSystemDirectoryHandle;
  multiple?: boolean;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) {
  if (!("showOpenFilePicker" in window)) return;
  try {
    return await window
      .showOpenFilePicker(options)
      .then((handles) => handles[0]);
  } catch (error) {
    if (isAbortError(error) || isActivePickerError(error)) return;
    throw error;
  }
}

export async function getNewFileHandle() {
  if (!("showSaveFilePicker" in window)) return;
  const opts = {
    types: [
      {
        description: "Elasto Mania level",
        accept: { "application/octet-stream": [".lev"] },
      },
    ],
  };
  try {
    return await window.showSaveFilePicker(opts);
  } catch (error) {
    if (isAbortError(error) || isActivePickerError(error)) return;
    throw error;
  }
}

export async function readFile(file: File): Promise<ArrayBuffer> {
  // Use ArrayBuffer so we preserve binary .lev contents
  return file.arrayBuffer();
}

export async function writeFile(
  fileHandle: FileSystemFileHandle,
  contents: BlobPart,
) {
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

/**
 * Verify the user has granted permission to read or write to the file, if
 * permission hasn't been granted, request permission.
 */
export async function verifyPermission(
  fileHandle: FileSystemFileHandle,
  { withWrite }: { withWrite: boolean } = { withWrite: false },
) {
  const opts: any = {};
  if (withWrite) {
    opts.writable = true;
    opts.mode = "readwrite";
  }

  if ((await fileHandle.queryPermission(opts)) === "granted") return true;
  if ((await fileHandle.requestPermission(opts)) === "granted") return true;
  return false;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isActivePickerError(error: unknown) {
  return error instanceof DOMException && error.name === "NotAllowedError";
}
