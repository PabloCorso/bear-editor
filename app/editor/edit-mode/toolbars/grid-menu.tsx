import { useEditor, useEditorActions } from "~/editor/use-editor-store";
import { MIN_GRID_SIZE, MAX_GRID_SIZE } from "~/editor/grid";
import { NumberInput } from "~/components/ui/number-input";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
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
      <div className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
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
            onKeyDown: (event) => event.stopPropagation(),
          }}
        />
      </div>
    </DropdownMenuGroup>
  );
}
