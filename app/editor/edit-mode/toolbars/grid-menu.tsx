import { useEditor, useEditorActions } from "~/editor/use-editor-store";
import { MIN_GRID_SIZE, MAX_GRID_SIZE } from "~/editor/grid";
import { NumberInput } from "~/components/ui/number-input";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "~/components/ui/dropdown-menu";

export function GridMenuGroup() {
  const grid = useEditor((state) => state.grid);
  const { setGrid } = useEditorActions();
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Grid</DropdownMenuLabel>
      <DropdownMenuCheckboxItem
        checked={grid.visible}
        onCheckedChange={(visible) => setGrid({ visible })}
      >
        Show grid
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem
        checked={grid.snap}
        onCheckedChange={(snap) => setGrid({ snap })}
      >
        Snap to grid
      </DropdownMenuCheckboxItem>
      <DropdownMenuItem
        aria-label="Edit grid size"
        className="justify-between gap-3"
        closeOnClick={false}
        onKeyDownCapture={(event) => {
          if (
            event.target === event.currentTarget &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            event.stopPropagation();
            const input = event.currentTarget.querySelector("input");
            requestAnimationFrame(() => input?.focus());
          }
        }}
      >
        <span>Grid size</span>
        <NumberInput
          aria-label="Grid size"
          size="sm"
          value={grid.size}
          min={MIN_GRID_SIZE}
          max={MAX_GRID_SIZE}
          step={1}
          smallStep={MIN_GRID_SIZE}
          snapOnStep={false}
          format={{ maximumFractionDigits: 2, useGrouping: false }}
          className="text-primary"
          onValueChange={(size) => {
            if (size !== null && Number.isFinite(size)) setGrid({ size });
          }}
          inputProps={{
            onKeyDown: (event) => {
              if (event.key !== "Escape") event.stopPropagation();
            },
          }}
        />
      </DropdownMenuItem>
    </DropdownMenuGroup>
  );
}
