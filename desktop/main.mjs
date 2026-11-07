import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  session,
  shell,
} from "electron";
import updater from "electron-updater";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const { autoUpdater } = updater;
const origin = "https://bear-editor.invalid";
let editor;
let updateReady = false;
let installOnClose = false;

function trusted(event) {
  return (
    editor &&
    event.sender === editor.webContents &&
    event.senderFrame === editor.webContents.mainFrame &&
    new URL(event.senderFrame.url).origin === origin
  );
}

ipcMain.handle("update-ready", (event) =>
  Boolean(trusted(event) && updateReady),
);
ipcMain.on("restart-to-update", (event) => {
  if (!trusted(event) || !updateReady || installOnClose) return;
  installOnClose = true;
  editor.close();
});

// beforeunload needs a synchronous decision, including when quitting via the OS.
ipcMain.on("confirm-close", (event, saving) => {
  if (!trusted(event)) {
    event.returnValue = false;
    return;
  }
  if (saving) {
    dialog.showMessageBoxSync(editor, {
      message: "A level is being saved. Try again when the save finishes.",
    });
    event.returnValue = false;
    return;
  }
  event.returnValue =
    dialog.showMessageBoxSync(editor, {
      type: "warning",
      message: "Discard unsaved changes?",
      buttons: ["Keep editing", "Discard changes"],
      defaultId: 0,
      cancelId: 0,
    }) === 1;
});

function setupUpdates() {
  if (
    !app.isPackaged ||
    (process.platform === "linux" && !process.env.APPIMAGE)
  )
    return;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("error", (error) =>
    console.warn("Desktop update:", error.message),
  );
  autoUpdater.on("update-downloaded", () => {
    updateReady = true;
    editor?.webContents.send("update-downloaded");
  });
  const check = () => {
    if (!updateReady) void autoUpdater.checkForUpdates().catch(() => {});
  };
  check();
  setInterval(check, 6 * 60 * 60 * 1000).unref();
}

await app.whenReady();
const editorSession = session.fromPartition("persist:bear-editor");
// A stable, local HTTPS origin gives Chromium's native file pickers and
// persisted directory handles the same secure context across launches.
const clientRoot = path.join(app.getAppPath(), "build", "client");
editorSession.protocol.handle("https", async (request) => {
  const url = new URL(request.url);
  if (url.origin !== origin || request.method !== "GET")
    return new Response(null, { status: 403 });
  try {
    const pathname = decodeURIComponent(url.pathname);
    if (
      pathname.includes("\\") ||
      pathname.includes(":") ||
      pathname.includes("\0")
    )
      return new Response(null, { status: 400 });
    const asset = path.resolve(
      clientRoot,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    const relative = path.relative(clientRoot, asset);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      return new Response(null, { status: 403 });
    return await net.fetch(pathToFileURL(asset).href);
  } catch {
    return new Response(null, { status: 404 });
  }
});

editor = new BrowserWindow({
  width: 1280,
  height: 850,
  title: "Bear Editor",
  webPreferences: {
    session: editorSession,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    preload: path.join(app.getAppPath(), "preload.cjs"),
  },
});
Menu.setApplicationMenu(
  Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
    { role: "editMenu" },
    { role: "windowMenu" },
  ]),
);
editor.webContents.on("will-navigate", (event, url) => {
  if (new URL(url).origin !== origin) event.preventDefault();
});
editor.webContents.setWindowOpenHandler(({ url }) => {
  const target = new URL(url);
  if (
    target.protocol === "https:" &&
    [
      "github.com",
      "discord.com",
      "chatgpt.com",
      "claude.ai",
      "gemini.google.com",
    ].includes(target.hostname)
  ) {
    void shell.openExternal(url).catch(console.warn);
  }
  return { action: "deny" };
});
editor.webContents.on("will-prevent-unload", () => {
  installOnClose = false;
});
editor.on("closed", () => {
  editor = undefined;
});
app.on("window-all-closed", () => {
  if (installOnClose) autoUpdater.quitAndInstall(false, true);
  else app.quit();
});
await editor.loadURL(origin);
setupUpdates();
