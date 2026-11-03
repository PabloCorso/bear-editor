import {
  ParagraphIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextBIcon,
  TextItalicIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { NumberInput } from "~/components/ui/number-input";
import { Popover, PopoverTrigger } from "~/components/ui/popover";
import { ELMA_PIXELS_PER_WORLD_UNIT } from "~/editor/constants";
import { worldToScreen } from "~/editor/helpers/coordinate-helpers";
import {
  builtInTextFonts,
  importTextFont,
  listTextFonts,
  loadTextFontPreviewFamily,
  type TextFontFace,
} from "~/editor/helpers/text-fonts";
import {
  defaultTextOptions,
  MAX_TEXT_CURVE_DETAIL,
  MIN_TEXT_CURVE_DETAIL,
  type TextOptions,
} from "~/editor/helpers/text-polygons";
import {
  useEditor,
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectTriggerIcon,
  SelectValue,
} from "~/components/ui/select";
import {
  Toolbar,
  ToolbarButton,
  ToolbarSeparator,
} from "~/components/ui/toolbar";
import { cn } from "~/utils/misc";
import {
  FloatingToolbarContent,
  FloatingToolbarPanel,
} from "./toolbars/floating-toolbar";
import {
  SettingsPopoverContent,
  SettingsPopoverFields,
} from "./toolbars/settings-popover";
import {
  TEXT_PLACEHOLDER,
  TextTool,
  type TextToolState,
} from "./tools/text-tool";

const alignmentIcons = {
  left: TextAlignLeftIcon,
  center: TextAlignCenterIcon,
  right: TextAlignRightIcon,
};

const ADD_FONT_VALUE = "__add-font__";
const MIN_TEXT_SIZE = 1;
const MAX_TEXT_SIZE = 1000;

type ResizeCorner = {
  horizontal: "left" | "right";
  vertical: "top" | "bottom";
};

type ResizeDrag = {
  pointerId: number;
  startPointer: { x: number; y: number };
  startVector: { x: number; y: number };
  startSize: number;
  anchor: {
    fixed: { x: number; y: number };
    horizontal: ResizeCorner["horizontal"];
    vertical: ResizeCorner["vertical"];
  };
};

const resizeCorners: ResizeCorner[] = [
  { horizontal: "left", vertical: "top" },
  { horizontal: "right", vertical: "top" },
  { horizontal: "left", vertical: "bottom" },
  { horizontal: "right", vertical: "bottom" },
];

export function TextEditorOverlay() {
  const activeToolId = useEditor((state) => state.activeToolId);
  const zoom = useEditor((state) => state.zoom);
  const viewPortOffset = useEditor((state) => state.viewPortOffset);
  const state = useEditorToolState<TextToolState>("text");
  const { getActiveTool } = useEditorActions();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeDrag = useRef<ResizeDrag | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [fonts, setFonts] = useState<TextFontFace[]>([...builtInTextFonts]);
  const [previewFamilies, setPreviewFamilies] = useState<
    Record<string, string>
  >({});
  const [importError, setImportError] = useState<string>();
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [caretOffset, setCaretOffset] = useState(0);
  const [textareaFocused, setTextareaFocused] = useState(false);

  const activeTextTool = getActiveTool<TextTool>("text");
  const options = state?.options ?? defaultTextOptions;
  const update = (patch: Partial<TextOptions>) =>
    activeTextTool?.updateOptions(patch);
  const draft = activeToolId === "text" ? state?.draft : undefined;

  useEffect(function restoreImportedFonts() {
    let cancelled = false;
    void listTextFonts()
      .then((available) => {
        if (!cancelled) setFonts(available);
      })
      .catch(() => {
        if (!cancelled) setImportError("Could not load imported fonts.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    function loadFontPreviews() {
      if (!draft) return;
      let cancelled = false;
      const previewIds = new Set([options.fontId]);
      if (fontMenuOpen) {
        for (const family of getFontFamilies(fonts)) {
          const previewFace =
            findFontFace(family.faces, false, false) ?? family.faces[0];
          previewIds.add(previewFace.id);
        }
      }
      void Promise.all(
        Array.from(
          previewIds,
          async (id) => [id, await loadTextFontPreviewFamily(id)] as const,
        ),
      )
        .then((loaded) => {
          if (!cancelled)
            setPreviewFamilies((current) => ({
              ...current,
              ...Object.fromEntries(loaded),
            }));
        })
        .catch(() => {
          if (!cancelled) setImportError("Could not preview font.");
        });
      return () => {
        cancelled = true;
      };
    },
    [draft, fontMenuOpen, fonts, options.fontId],
  );

  useEffect(
    function focusNewDraft() {
      if (!draft) return;
      const frame = requestAnimationFrame(() => textareaRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    },
    [draft],
  );

  useEffect(
    function commitOutsideTextEditor() {
      if (!draft) return;
      const handlePointerDown = (event: PointerEvent) => {
        const target = event.target;
        if (target instanceof Element && target.closest("[data-text-editor]"))
          return;
        event.preventDefault();
        event.stopPropagation();
        activeTextTool?.commit();
      };
      document.addEventListener("pointerdown", handlePointerDown, true);
      return () =>
        document.removeEventListener("pointerdown", handlePointerDown, true);
    },
    [activeTextTool, draft],
  );

  if (!draft) return null;

  const draftPosition = draft.position;
  const screen = worldToScreen(draftPosition, viewPortOffset, zoom);
  const fontSize = (options.size / ELMA_PIXELS_PER_WORLD_UNIT) * zoom;
  const width = Math.max(1, (state?.bounds?.width ?? 0) * zoom);
  const height = Math.max(1, (state?.bounds?.height ?? 0) * zoom);
  const toolbarBelow = screen.y < 72;
  const activeFont =
    fonts.find((font) => font.id === options.fontId) ?? builtInTextFonts[0];
  const fontFamilies = getFontFamilies(fonts);
  const activeFamily = fontFamilies.find(
    (family) => family.name === activeFont.family,
  )!;
  const { bold: isBold, italic: isItalic } = getFontStyle(activeFont);
  const ActiveAlignmentIcon = alignmentIcons[options.align];
  const boldFace = findFontFace(activeFamily.faces, !isBold, isItalic);
  const italicFace = findFontFace(activeFamily.faces, isBold, !isItalic);
  const caret = activeTextTool?.getCaretMetrics(
    Math.min(caretOffset, options.text.length),
  );

  async function importFont(file: File) {
    setImportError(undefined);
    try {
      const font = await importTextFont(file);
      setFonts((current) => [
        ...current.filter((candidate) => candidate.id !== font.id),
        font,
      ]);
      update({ fontId: font.id });
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Could not import font.",
      );
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  }

  function selectFontFamily(name: string) {
    const family = fontFamilies.find((candidate) => candidate.name === name);
    if (!family) return;
    update({
      fontId:
        findFontFace(family.faces, isBold, isItalic)?.id ?? family.faces[0].id,
    });
  }

  function toggleFontStyle(kind: "bold" | "italic") {
    const face = kind === "bold" ? boldFace : italicFace;
    if (face) update({ fontId: face.id });
  }

  function beginResize(
    event: ReactPointerEvent<HTMLButtonElement>,
    corner: ResizeCorner,
  ) {
    if (!state?.bounds) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeDrag.current = {
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      startVector: {
        x: corner.horizontal === "left" ? -width : width,
        y: corner.vertical === "top" ? -height : height,
      },
      startSize: options.size,
      anchor: {
        fixed: {
          x:
            corner.horizontal === "left"
              ? draftPosition.x + state.bounds.width
              : draftPosition.x,
          y:
            corner.vertical === "top"
              ? draftPosition.y + state.bounds.height
              : draftPosition.y,
        },
        horizontal: corner.horizontal,
        vertical: corner.vertical,
      },
    };
  }

  function continueResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = resizeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const vector = {
      x: drag.startVector.x + event.clientX - drag.startPointer.x,
      y: drag.startVector.y + event.clientY - drag.startPointer.y,
    };
    const lengthSquared = drag.startVector.x ** 2 + drag.startVector.y ** 2;
    const scale = lengthSquared
      ? (vector.x * drag.startVector.x + vector.y * drag.startVector.y) /
        lengthSquared
      : 1;
    const size = Math.round(
      Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, drag.startSize * scale)),
    );
    if (size !== options.size) activeTextTool?.resizeDraft(size, drag.anchor);
  }

  function finishResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (resizeDrag.current?.pointerId !== event.pointerId) return;
    resizeDrag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div
      data-text-editor
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
    >
      <div
        className="absolute"
        style={{ left: screen.x, top: screen.y, maxWidth: "calc(100% - 16px)" }}
      >
        <div
          className={cn(
            "pointer-events-auto absolute left-0",
            toolbarBelow ? "top-full mt-3" : "bottom-full mb-3",
          )}
        >
          <Toolbar
            className="max-w-[calc(100vw-2rem)] flex-nowrap overflow-x-auto p-1.5 shadow-lg"
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Select
              value={activeFont.family}
              onOpenChange={setFontMenuOpen}
              onValueChange={(value) => {
                if (!value) return;
                if (value === ADD_FONT_VALUE) {
                  importInput.current?.click();
                  return;
                }
                selectFontFamily(value);
              }}
            >
              <SelectTrigger
                aria-label="Font"
                className="h-8 max-w-40 min-w-32 px-2 text-xs font-normal"
              >
                <SelectValue>{activeFont.family}</SelectValue>
                <SelectTriggerIcon />
              </SelectTrigger>
              <SelectContent data-text-editor sideOffset={6}>
                <SelectItem
                  value={ADD_FONT_VALUE}
                  iconBefore={<PlusIcon />}
                  className="text-accent mb-1 border-b border-separator pb-2"
                >
                  Add font
                </SelectItem>
                {fontFamilies.map((family) => {
                  const previewFace =
                    findFontFace(family.faces, false, false) ?? family.faces[0];
                  return (
                    <SelectItem
                      key={family.name}
                      value={family.name}
                      style={{
                        fontFamily: previewFamilies[previewFace.id],
                      }}
                    >
                      {family.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <ToolbarSeparator />
            <DeferredNumberInput
              ariaLabel="Font size"
              size="md"
              min={MIN_TEXT_SIZE}
              max={MAX_TEXT_SIZE}
              value={options.size}
              onCommit={(size) => update({ size })}
            />
            <ToolbarSeparator />
            <Popover modal={false}>
              <PopoverTrigger>
                <ToolbarButton
                  size="sm"
                  aria-label="Text style"
                  title="Text style"
                >
                  <TextBIcon />
                </ToolbarButton>
              </PopoverTrigger>
              <FloatingToolbarContent
                data-text-editor
                side={toolbarBelow ? "bottom" : "top"}
                sideOffset={6}
              >
                <FloatingToolbarPanel className="rounded-lg p-1">
                  <ToolbarButton
                    size="sm"
                    aria-label="Bold"
                    aria-pressed={isBold}
                    disabled={!boldFace}
                    className={cn(isBold && "bg-primary-hover/50")}
                    onClick={() => toggleFontStyle("bold")}
                  >
                    <TextBIcon />
                  </ToolbarButton>
                  <ToolbarButton
                    size="sm"
                    aria-label="Italic"
                    aria-pressed={isItalic}
                    disabled={!italicFace}
                    className={cn(isItalic && "bg-primary-hover/50")}
                    onClick={() => toggleFontStyle("italic")}
                  >
                    <TextItalicIcon />
                  </ToolbarButton>
                </FloatingToolbarPanel>
              </FloatingToolbarContent>
            </Popover>
            <Popover modal={false}>
              <PopoverTrigger>
                <ToolbarButton
                  size="sm"
                  aria-label="Text alignment"
                  title="Text alignment"
                >
                  <ActiveAlignmentIcon />
                </ToolbarButton>
              </PopoverTrigger>
              <FloatingToolbarContent
                data-text-editor
                side={toolbarBelow ? "bottom" : "top"}
                sideOffset={6}
              >
                <FloatingToolbarPanel className="rounded-lg p-1">
                  {(["left", "center", "right"] as const).map((align) => {
                    const Icon = alignmentIcons[align];
                    return (
                      <ToolbarButton
                        key={align}
                        size="sm"
                        aria-label={`${align[0].toUpperCase()}${align.slice(1)} align`}
                        aria-pressed={options.align === align}
                        className={cn(
                          options.align === align && "bg-primary-hover/50",
                        )}
                        onClick={() => update({ align })}
                      >
                        <Icon />
                      </ToolbarButton>
                    );
                  })}
                </FloatingToolbarPanel>
              </FloatingToolbarContent>
            </Popover>
            <Popover modal={false}>
              <PopoverTrigger>
                <ToolbarButton
                  size="sm"
                  aria-label="Text spacing"
                  title="Text spacing"
                >
                  <ParagraphIcon />
                </ToolbarButton>
              </PopoverTrigger>
              <SettingsPopoverContent
                data-text-editor
                title="Text spacing"
                closeLabel="Close text spacing"
                side={toolbarBelow ? "bottom" : "top"}
                align="end"
                sideOffset={6}
              >
                <SettingsPopoverFields>
                  <span className="text-xs font-bold text-secondary">
                    Letter spacing
                  </span>
                  <DeferredNumberInput
                    ariaLabel="Letter spacing"
                    size="sm"
                    min={0}
                    max={100}
                    value={options.spacing}
                    onCommit={(spacing) => update({ spacing })}
                  />
                  <span className="text-xs font-bold text-secondary">
                    Line height
                  </span>
                  <DeferredNumberInput
                    ariaLabel="Line height"
                    size="sm"
                    min={1}
                    max={3}
                    step={0.1}
                    value={options.lineHeight}
                    onCommit={(lineHeight) => update({ lineHeight })}
                  />
                </SettingsPopoverFields>
              </SettingsPopoverContent>
            </Popover>
            <Popover modal={false}>
              <PopoverTrigger>
                <ToolbarButton
                  size="sm"
                  aria-label="Polygons"
                  title="Polygons"
                  className={cn(
                    options.curveDetail !== defaultTextOptions.curveDetail &&
                      "bg-primary-hover/50",
                  )}
                >
                  <SlidersHorizontalIcon />
                </ToolbarButton>
              </PopoverTrigger>
              <SettingsPopoverContent
                data-text-editor
                title="Polygons"
                closeLabel="Close polygons"
                side={toolbarBelow ? "bottom" : "top"}
                align="end"
                sideOffset={6}
                {...(state?.curveDetailAvailable
                  ? {
                      resetLabel: "Reset curve detail",
                      isDefault:
                        options.curveDetail === defaultTextOptions.curveDetail,
                      onReset: () =>
                        update({
                          curveDetail: defaultTextOptions.curveDetail,
                        }),
                    }
                  : {})}
              >
                <div className="min-w-48">
                  {state?.curveDetailAvailable && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-secondary">
                        Curve detail
                      </span>
                      <DeferredNumberInput
                        ariaLabel="Curve detail"
                        size="sm"
                        min={MIN_TEXT_CURVE_DETAIL}
                        max={MAX_TEXT_CURVE_DETAIL}
                        value={options.curveDetail}
                        onCommit={(curveDetail) => update({ curveDetail })}
                      />
                    </div>
                  )}
                  <div
                    className={cn(
                      "flex justify-between gap-4 text-[11px] text-secondary",
                      state?.curveDetailAvailable &&
                        "mt-2 border-t border-default pt-2",
                    )}
                  >
                    <GeometryValue
                      label="Vertices"
                      value={state?.vertexCount ?? 0}
                    />
                    <GeometryValue
                      label="Polygons"
                      value={state?.polygonCount ?? 0}
                    />
                  </div>
                </div>
              </SettingsPopoverContent>
            </Popover>
            <input
              ref={importInput}
              type="file"
              accept=".ttf,.otf,.woff,font/ttf,font/otf,font/woff"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void importFont(file);
              }}
            />
          </Toolbar>
          {(importError || state?.error) && (
            <p
              role="alert"
              className="mt-1 rounded bg-screen/90 px-2 py-1 text-xs text-secondary"
            >
              {importError || state?.error}
            </p>
          )}
        </div>
        <div
          className="pointer-events-auto relative rounded-sm border border-accent ring-1 ring-primary/40"
          style={{ width, height }}
        >
          <textarea
            ref={textareaRef}
            aria-label="Text"
            rows={1}
            maxLength={120}
            value={options.text}
            placeholder={TEXT_PLACEHOLDER}
            onChange={(event) => {
              setCaretOffset(event.currentTarget.selectionStart);
              update({ text: event.target.value });
            }}
            onSelect={(event) =>
              setCaretOffset(event.currentTarget.selectionStart)
            }
            onFocus={() => setTextareaFocused(true)}
            onBlur={() => setTextareaFocused(false)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                activeTextTool?.cancel();
              }
            }}
            className="absolute inset-0 size-full resize-none overflow-hidden border-0 bg-transparent p-0 text-transparent caret-transparent outline-hidden placeholder:text-transparent"
            style={{
              fontFamily: previewFamilies[activeFont.id] ?? activeFont.family,
              fontSize,
              fontWeight: isBold ? 700 : 400,
              fontStyle: isItalic ? "italic" : "normal",
              lineHeight: options.lineHeight,
              letterSpacing:
                options.spacing * (zoom / ELMA_PIXELS_PER_WORLD_UNIT),
              textAlign: options.align,
            }}
          />
          {textareaFocused && caret && (
            <span
              aria-hidden
              className="pointer-events-none absolute w-px [animation:text-caret-blink_1s_steps(2,start)_infinite] bg-white"
              style={{
                left: caret.x * zoom,
                top: caret.y * zoom,
                height: Math.max(1, caret.height * zoom),
              }}
            />
          )}
          {resizeCorners.map((corner) => {
            const top = corner.vertical === "top";
            const left = corner.horizontal === "left";
            return (
              <button
                key={`${corner.vertical}-${corner.horizontal}`}
                type="button"
                aria-label={`Resize text from ${corner.vertical} ${corner.horizontal}`}
                className={cn(
                  "absolute z-10 size-2 rounded-xs border border-accent bg-white",
                  top ? "-top-1" : "-bottom-1",
                  left ? "-left-1" : "-right-1",
                  top === left ? "cursor-nwse-resize" : "cursor-nesw-resize",
                )}
                onPointerDown={(event) => beginResize(event, corner)}
                onPointerMove={continueResize}
                onPointerUp={finishResize}
                onPointerCancel={finishResize}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GeometryValue({ label, value }: { label: string; value: number }) {
  return (
    <p className="flex gap-1 tabular-nums">
      <span className="font-bold text-primary">{value.toLocaleString()}</span>
      <span>{label}</span>
    </p>
  );
}

function DeferredNumberInput({
  ariaLabel,
  size,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  ariaLabel: string;
  size: "sm" | "md";
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<{
    source: number;
    value: number | null;
  }>({ source: value, value });

  if (draft.source !== value) {
    setDraft({ source: value, value });
  }

  return (
    <NumberInput
      aria-label={ariaLabel}
      size={size}
      value={draft.value}
      min={min}
      max={max}
      step={step ?? 1}
      smallStep={step ?? 1}
      largeStep={step ?? 1}
      keyboardStep={step ?? 1}
      snapOnStep={false}
      format={{
        maximumFractionDigits: step && step < 1 ? 1 : 0,
        useGrouping: false,
      }}
      onValueChange={(nextValue) =>
        setDraft({ source: value, value: nextValue })
      }
      onValueCommitted={(nextValue) => {
        const committedValue = nextValue ?? value;
        setDraft({ source: value, value: committedValue });
        if (committedValue !== value) onCommit(committedValue);
      }}
      onKeyDown={(event) => event.stopPropagation()}
      inputProps={{
        inputMode: step && step < 1 ? "decimal" : "numeric",
        onKeyDown: (event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        },
      }}
    />
  );
}

function getFontFamilies(fonts: TextFontFace[]) {
  const families = new Map<string, TextFontFace[]>();
  for (const font of fonts) {
    const faces = families.get(font.family) ?? [];
    faces.push(font);
    families.set(font.family, faces);
  }
  return Array.from(families, ([name, faces]) => ({ name, faces }));
}

function getFontStyle(font: TextFontFace) {
  const style = font.style.toLowerCase();
  return {
    bold: style.includes("bold"),
    italic: style.includes("italic") || style.includes("oblique"),
  };
}

function findFontFace(faces: TextFontFace[], bold: boolean, italic: boolean) {
  return faces.find((face) => {
    const style = getFontStyle(face);
    return style.bold === bold && style.italic === italic;
  });
}
