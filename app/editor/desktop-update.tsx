import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";

export function DesktopUpdate() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const desktop = window.bearDesktop;
    if (!desktop) return;
    const unsubscribe = desktop.onUpdateReady(() => setReady(true));
    void desktop.updateReady().then((downloaded) => {
      if (downloaded) setReady(true);
    });
    return unsubscribe;
  }, []);
  if (!ready) return null;
  return (
    <Button
      size="sm"
      className="absolute right-4 bottom-16 z-20"
      onClick={() => window.bearDesktop?.restartToUpdate()}
    >
      Restart to update
    </Button>
  );
}
