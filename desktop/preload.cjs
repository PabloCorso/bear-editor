// The sandboxed preload exposes only operations on this editor window.
/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bearDesktop", {
  development: Boolean(process.env.BEAR_DESKTOP_DEV_URL),
  confirmClose: (saving) => ipcRenderer.sendSync("confirm-close", saving),
  appVersion: () => ipcRenderer.invoke("app-version"),
  updateReady: () => ipcRenderer.invoke("update-ready"),
  onUpdateReady(callback) {
    const listener = (_event, version) => callback(version);
    ipcRenderer.on("update-downloaded", listener);
    return () => ipcRenderer.removeListener("update-downloaded", listener);
  },
  restartToUpdate: () => ipcRenderer.send("restart-to-update"),
});
