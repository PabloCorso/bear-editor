declare global {
  interface Window {
    showOpenFilePicker(
      options?: OpenFilePickerOptions,
    ): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker(
      options?: SaveFilePickerOptions,
    ): Promise<FileSystemFileHandle>;
    showDirectoryPicker(
      options?: DirectoryPickerOptions,
    ): Promise<FileSystemDirectoryHandle>;
  }

  interface FileSystemFileHandle {
    queryPermission?: any;
    requestPermission?: any;
  }

  interface FileSystemDirectoryHandle {
    queryPermission?: any;
    requestPermission?: any;
  }
}

export {};
