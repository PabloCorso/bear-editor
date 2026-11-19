interface Window {
  bearDesktop?: {
    development: boolean;
    confirmClose(saving: boolean): boolean;
    appVersion(): Promise<string | null>;
    updateReady(): Promise<string | null>;
    onUpdateReady(callback: (version: string) => void): () => void;
    restartToUpdate(): void;
  };
}
