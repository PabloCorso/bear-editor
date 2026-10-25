import { TextTIcon } from "@phosphor-icons/react/dist/ssr";
import {
  ToolControlButton,
  ToolControlMenu,
  type ToolControlButtonProps,
} from "./tool";
import { Toolbar } from "~/components/ui/toolbar";
import { Input } from "~/components/ui/input";
import { defaultTools } from "../tools/default-tools";
import { TextTool, type TextToolState } from "../tools/text-tool";
import {
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import {
  defaultTextOptions,
  textFonts,
  type TextOptions,
} from "~/editor/helpers/text-polygons";

export function TextToolControl(props: ToolControlButtonProps) {
  const state = useEditorToolState<TextToolState>("text");
  const { getActiveTool } = useEditorActions();
  const options = state?.options ?? defaultTextOptions;
  const update = (patch: Partial<TextOptions>) =>
    getActiveTool<TextTool>("text")?.updateOptions(patch);
  return (
    <ToolControlMenu
      id="text"
      button={
        <ToolControlButton {...defaultTools.text} {...props}>
          <TextTIcon />
        </ToolControlButton>
      }
    >
      <Toolbar
        orientation="vertical"
        className="w-60 items-stretch gap-3 p-3"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Text
          <textarea
            aria-label="Text"
            rows={3}
            maxLength={120}
            value={options.text}
            onChange={(event) => update({ text: event.target.value })}
            className="focus:border-primary resize-y rounded border border-default bg-screen p-2 text-sm text-primary outline-hidden"
          />
        </label>
        <label className="flex items-center justify-between text-xs text-secondary">
          Font
          <select
            aria-label="Text font"
            value={options.font}
            onChange={(event) =>
              update({ font: event.target.value as TextOptions["font"] })
            }
            className="rounded border border-default bg-screen p-1 text-primary"
          >
            {Object.entries(textFonts).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-3 text-xs text-secondary">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={options.bold}
              onChange={(event) => update({ bold: event.target.checked })}
            />
            Bold
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={options.italic}
              onChange={(event) => update({ italic: event.target.checked })}
            />
            Italic
          </label>
        </div>
        {(
          [
            ["size", "Size (px)", 12, 1000, 1],
            ["spacing", "Letter spacing (px)", 0, 100, 1],
            ["lineHeight", "Line height", 1, 3, 0.1],
          ] as const
        ).map(([key, label, min, max, step]) => (
          <label
            key={key}
            className="flex items-center justify-between gap-2 text-xs text-secondary"
          >
            {label}
            <Input
              aria-label={`Text ${label.toLowerCase()}`}
              type="number"
              size="sm"
              className="w-16"
              min={min}
              max={max}
              step={step}
              value={options[key]}
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber;
                if (Number.isFinite(value) && value >= min && value <= max)
                  update({ [key]: value });
              }}
            />
          </label>
        ))}
        <label className="flex items-center justify-between text-xs text-secondary">
          Alignment
          <select
            aria-label="Text alignment"
            value={options.align}
            onChange={(event) =>
              update({ align: event.target.value as TextOptions["align"] })
            }
            className="rounded border border-default bg-screen p-1 text-primary"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
        <p role="status" className="text-xs text-secondary">
          {state?.status === "loading"
            ? "Loading font…"
            : state?.error ||
              (state?.vertexCount
                ? `Click to place · ${state.vertexCount} vertices`
                : "Enter text to preview.")}
        </p>
        {state?.status === "error" && (
          <button
            type="button"
            className="text-xs text-primary underline"
            onClick={() => update({})}
          >
            Try again
          </button>
        )}
      </Toolbar>
    </ToolControlMenu>
  );
}
