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
const devUrl = process.env.BEAR_DESKTOP_DEV_URL;
const testUpdate = process.env.BEAR_DESKTOP_TEST_UPDATE === "1";
const origin = devUrl ? new URL(devUrl).origin : "https://bear-editor.invalid";
let editor;
let updateReady = testUpdate;
let updateVersion = testUpdate ? app.getVersion() : null;
let installOnClose = false;

function trusted(event) {
  return (
    editor &&
    event.sender === editor.webContents &&
    event.senderFrame === editor.webContents.mainFrame &&
    new URL(event.senderFrame.url).origin === origin
  );
}

ipcMain.handle("app-version", (event) =>
  trusted(event) ? app.getVersion() : null,
);
ipcMain.handle("update-ready", (event) =>
  trusted(event) && updateReady ? updateVersion : null,
);
ipcMain.on("restart-to-update", (event) => {
  if (!trusted(event) || !updateReady || installOnClose) return;
  installOnClose = !testUpdate;
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
  if (testUpdate) return;
  if (
    process.platform === "darwin" ||
    !app.isPackaged ||
    (process.platform === "linux" && !process.env.APPIMAGE)
  )
    return;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("error", (error) =>
    console.warn("Desktop update:", error.message),
  );
  autoUpdater.on("update-downloaded", (info) => {
    updateReady = true;
    updateVersion = info.version;
    editor?.webContents.send("update-downloaded", info.version);
  });
  const check = () => {
    if (!updateReady) void autoUpdater.checkForUpdates().catch(() => {});
  };
  check();
  setInterval(check, 6 * 60 * 60 * 1000).unref();
}

async function start() {
  const editorSession = session.fromPartition("persist:bear-editor");
  // A stable, local HTTPS origin gives Chromium's native file pickers and
  // persisted directory handles the same secure context across launches.
  const clientRoot = path.join(app.getAppPath(), "build", "client");
  if (!devUrl)
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
    show: false,
    title: "Bear Editor",
    webPreferences: {
      session: editorSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(app.getAppPath(), "preload.cjs"),
    },
  });
  editor.once("ready-to-show", () => {
    editor.maximize();
    editor.show();
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      { role: "editMenu" },
      { role: "windowMenu" },
      ...(devUrl
        ? [
            {
              label: "Development",
              submenu: [
                {
                  role: "toggleDevTools",
                  accelerator:
                    process.platform === "darwin"
                      ? "Alt+Command+I"
                      : "Control+Shift+I",
                },
              ],
            },
          ]
        : []),
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
  await editor.loadURL(devUrl ?? origin);
  setupUpdates();
}

void app.whenReady().then(start);
