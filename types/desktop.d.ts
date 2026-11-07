interface Window {
  bearDesktop?: {
    confirmClose(saving: boolean): boolean;
    updateReady(): Promise<boolean>;
    onUpdateReady(callback: () => void): () => void;
    restartToUpdate(): void;
  };
}
