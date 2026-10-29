import { Fragment, useRef, useState, useSyncExternalStore } from "react";
import { useEditor, useEditorStore } from "~/editor/use-editor-store";
import { activeTestStart } from "~/editor/test-starts";
import { screenToWorld } from "~/editor/helpers/coordinate-helpers";
import { goToTestStart } from "~/editor/helpers/test-start-navigation";
import { GO_TO_PLAY_START_SHORTCUT } from "./toolbars/keyboard-shortcuts";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "~/components/ui/dropdown-menu";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import type { SelectTool } from "~/editor/edit-mode/tools/select-tool";
import { Button } from "~/components/ui/button";
import { ToolButton } from "~/components/tool-button";
import {
  ArrowRightIcon,
  CheckIcon,
  DotsThreeVerticalIcon,
  PlusIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Position } from "~/editor/elma-types";
import { KuskiIcon } from "~/components/kuski-icon";

function subscribePickerBreakpoint(onChange: () => void) {
  const query = window.matchMedia("(min-width: 640px)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getPickerBreakpoint() {
  return window.matchMedia("(min-width: 640px)").matches;
}

function getServerPickerBreakpoint() {
  return true;
}

export function TestStartPicker({ mobile = false }: { mobile?: boolean }) {
  const desktop = useSyncExternalStore(
    subscribePickerBreakpoint,
    getPickerBreakpoint,
    getServerPickerBreakpoint,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const rename = useEditor((state) => state.testStartRename);
  const store = useEditorStore();
  const session = useEditor((state) => state.testStarts);
  const start = useEditor((state) => state.start);
  const active = activeTestStart({ start, testStarts: session });
  const items = [
    {
      id: null,
      name: session.levelName,
      position: start,
      color: session.levelColor,
    },
    ...session.items,
  ];
  return (
    <Popover
      open={desktop !== mobile && (open || rename !== null)}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) finishTestStartRename(store);
      }}
    >
      <PopoverTrigger>
        <ToolButton ref={triggerRef} name={`Play start: ${active.name}`}>
          <KuskiIcon color={active.color} />
        </ToolButton>
      </PopoverTrigger>
      <PopoverContent
        anchor={() => triggerRef.current?.closest('[role="toolbar"]') ?? null}
        align="end"
        initialFocus={() => document.getElementById("test-start-name") ?? true}
        className="w-60 max-w-[calc(100vw-2rem)] rounded-xl border border-default bg-screen/80 p-1 shadow-sm"
      >
        {items.map((item) => (
          <Fragment key={item.id ?? "level"}>
            <div className="flex items-center gap-1">
              {rename?.id === item.id ? (
                <Button
                  as="form"
                  size="sm"
                  className={testStartNameClassName}
                  iconBefore={<KuskiIcon color={item.color} />}
                  iconAfter={
                    items.length > 1 && active.id === item.id ? (
                      <CheckIcon />
                    ) : undefined
                  }
                  onSubmit={(event) => {
                    event.preventDefault();
                    finishTestStartRename(store);
                  }}
                >
                  <input
                    id="test-start-name"
                    aria-label="Player name"
                    className="min-w-0 flex-1 rounded-xs border-0 bg-transparent p-0 text-left text-inherit outline-hidden focus-visible:focus-ring"
                    style={{ font: "inherit" }}
                    value={rename.name}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      store.setState({
                        testStartRename: {
                          ...rename,
                          name: event.target.value,
                        },
                      })
                    }
                    onBlur={() => finishTestStartRename(store)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Escape") {
                        event.preventDefault();
                        store.setState({ testStartRename: null });
                      }
                    }}
                  />
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  className={testStartNameClassName}
                  aria-pressed={active.id === item.id}
                  iconBefore={<KuskiIcon color={item.color} />}
                  iconAfter={
                    items.length > 1 && active.id === item.id ? (
                      <CheckIcon />
                    ) : undefined
                  }
                  onClick={() =>
                    store.getState().actions.activateTestStart(item.id)
                  }
                >
                  <span className="flex-1 truncate text-left">{item.name}</span>
                  {"ride" in item && item.ride && (
                    <span
                      title="Recorded ride and rewind history"
                      className="text-xs text-secondary"
                    >
                      Ride
                    </span>
                  )}
                </Button>
              )}
              <ToolButton
                name={`Go to ${item.name}`}
                shortcut={
                  active.id === item.id ? GO_TO_PLAY_START_SHORTCUT : undefined
                }
                size="sm"
                iconSize="sm"
                onClick={() => {
                  goToTestStart(store, item.position);
                }}
              >
                <ArrowRightIcon />
              </ToolButton>
              <DropdownMenu
                modal={false}
                onOpenChange={(menuOpen) => {
                  if (!menuOpen && store.getState().testStartRename) {
                    requestAnimationFrame(() => {
                      document.getElementById("test-start-name")?.focus();
                    });
                  }
                }}
              >
                <DropdownMenuTrigger>
                  <ToolButton
                    name={`Actions for ${item.name}`}
                    size="sm"
                    iconSize="sm"
                  >
                    <DotsThreeVerticalIcon />
                  </ToolButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={4}
                  finalFocus={() =>
                    document.getElementById("test-start-name") ?? true
                  }
                >
                  <TestStartActions id={item.id} />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {item.id === null && session.items.length > 0 && (
              <div
                role="separator"
                className="-mx-1 my-1 h-px bg-[var(--border-separator)]"
              />
            )}
          </Fragment>
        ))}
        <Button
          size="sm"
          className="w-full justify-start gap-2 px-2 font-normal text-secondary hover:text-primary"
          iconBefore={<PlusIcon />}
          onClick={() => {
            const state = store.getState();
            const rect = document
              .querySelector("canvas")
              ?.getBoundingClientRect();
            if (!rect) return;
            addTestStartAndGoTo(
              store,
              screenToWorld(
                { x: rect.width / 2, y: rect.height / 2 },
                state.viewPortOffset,
                state.zoom,
              ),
            );
          }}
        >
          Add test player
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function TestStartContextMenu() {
  const store = useEditorStore();
  const menu = useEditor((state) => state.testStartMenu);
  const isPlayMode = useEditor((state) => state.isPlayMode);
  if (!menu || menu.selectionMenu || isPlayMode) return null;
  const anchor = {
    getBoundingClientRect: () => new DOMRect(menu.x, menu.y, 0, 0),
  };
  return (
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) store.setState({ testStartMenu: null });
      }}
    >
      <DropdownMenuContent
        anchor={anchor}
        positionMethod="fixed"
        finalFocus={false}
        sideOffset={0}
      >
        <TestStartMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TestStartSubmenu() {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger openOnHover>Test player</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <TestStartMenuItems />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function TestStartMenuItems() {
  const store = useEditorStore();
  const menu = useEditor((state) => state.testStartMenu);
  if (!menu) return null;
  function closeMenu() {
    store
      .getState()
      .actions.getTool<SelectTool>(defaultTools.select.id)
      ?.closeContextMenu();
    store.setState({ testStartMenu: null });
  }
  return menu.id === undefined ? (
    <DropdownMenuItem
      onClick={() => {
        store.getState().actions.addTestStart(menu.position);
        closeMenu();
      }}
    >
      Add test start here
    </DropdownMenuItem>
  ) : (
    <TestStartActions id={menu.id} onAction={closeMenu} />
  );
}

function addTestStartAndGoTo(
  store: ReturnType<typeof useEditorStore>,
  position: Position,
) {
  store.getState().actions.addTestStart(position);
  goToTestStart(store, position);
}

function TestStartActions({
  id,
  onAction,
}: {
  id: string | null;
  onAction?: () => void;
}) {
  const store = useEditorStore();
  const session = useEditor((state) => state.testStarts);
  const start = useEditor((state) => state.start);
  const item =
    id === null
      ? { name: session.levelName, position: start }
      : session.items.find((item) => item.id === id);
  if (!item) return null;
  function run(action: () => void) {
    action();
    onAction?.();
  }
  return (
    <>
      {session.activeId !== id && (
        <DropdownMenuItem
          onClick={() =>
            run(() => store.getState().actions.activateTestStart(id))
          }
        >
          Use as play start
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        shortcut="Enter"
        onClick={() =>
          run(() => {
            store.getState().actions.activateTestStart(id);
            store.getState().actions.startPlayMode();
          })
        }
      >
        Play from here
      </DropdownMenuItem>
      {id !== null && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              run(() => store.getState().actions.promoteTestStart(id))
            }
          >
            Move level start here
          </DropdownMenuItem>
        </>
      )}
      {id !== null && "ride" in item && item.ride && (
        <DropdownMenuItem
          onClick={() =>
            run(() => store.getState().actions.moveTestStart(id, item.position))
          }
        >
          Use position only
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        shortcut={
          session.activeId === id ? GO_TO_PLAY_START_SHORTCUT : undefined
        }
        onClick={() => run(() => goToTestStart(store, item.position))}
      >
        Go to start
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() =>
          run(() =>
            store.setState({ testStartRename: { id, name: item.name } }),
          )
        }
      >
        Rename…
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() =>
          run(() =>
            addTestStartAndGoTo(store, {
              x: item.position.x + 1,
              y: item.position.y,
            }),
          )
        }
      >
        Add test player
      </DropdownMenuItem>
      {id !== null && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            shortcut="Delete"
            onClick={() =>
              run(() => store.getState().actions.deleteTestStart(id))
            }
          >
            Delete
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}

const testStartNameClassName =
  "min-w-0 flex-1 justify-start gap-2 px-2 font-normal";

function finishTestStartRename(store: ReturnType<typeof useEditorStore>) {
  const target = store.getState().testStartRename;
  if (!target) return;
  store.setState({ testStartRename: null });
  if (target.name.trim()) {
    store.getState().actions.renameTestStart(target.id, target.name);
  }
}
