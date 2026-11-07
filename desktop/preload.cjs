// The sandboxed preload exposes only operations on this editor window.
/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bearDesktop", {
  confirmClose: (saving) => ipcRenderer.sendSync("confirm-close", saving),
  updateReady: () => ipcRenderer.invoke("update-ready"),
  onUpdateReady(callback) {
    const listener = () => callback();
    ipcRenderer.on("update-downloaded", listener);
    return () => ipcRenderer.removeListener("update-downloaded", listener);
  },
  restartToUpdate: () => ipcRenderer.send("restart-to-update"),
});
