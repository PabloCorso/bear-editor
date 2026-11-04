import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { ToolbarButton } from "~/components/ui/toolbar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { useEditorHistory, useHistoryState } from "~/editor/use-editor-store";

export function HistoryControl() {
  const history = useEditorHistory();
  const { entries, cursor, active } = useHistoryState();
  return (
    <Popover>
      <PopoverTrigger>
        <ToolbarButton aria-label="History">
          <ClockCounterClockwiseIcon />
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-72 overflow-hidden rounded-lg border border-default bg-screen shadow-lg"
      >
        <h2 className="border-b border-separator px-3 py-2 text-sm font-semibold">
          History
        </h2>
        <ol
          aria-label="Editing history"
          className="max-h-72 overflow-y-auto p-1 text-sm"
        >
          <li>
            <HistoryStep
              current={cursor === 0}
              onClick={() => history.goTo(null)}
            >
              Starting state
            </HistoryStep>
          </li>
          {entries.map((entry, index) => (
            <li key={entry.id}>
              <HistoryStep
                current={cursor === index + 1}
                future={index >= cursor}
                onClick={() => history.goTo(entry.id)}
              >
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                <time
                  dateTime={new Date(entry.timestamp).toISOString()}
                  className="shrink-0 text-xs text-secondary"
                >
                  {new Date(entry.timestamp).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </HistoryStep>
            </li>
          ))}
        </ol>
        {active && (
          <p className="border-t border-separator px-3 py-2 text-xs text-secondary">
            {active.label}…
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function HistoryStep({
  current,
  future,
  children,
  onClick,
}: {
  current: boolean;
  future?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={current ? "step" : undefined}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded px-2 py-2 text-left outline-hidden hover:bg-primary-hover/50 focus-visible:focus-ring ${current ? "bg-primary/60 font-semibold text-primary" : future ? "text-secondary" : "text-primary"}`}
    >
      {children}
    </button>
  );
}
