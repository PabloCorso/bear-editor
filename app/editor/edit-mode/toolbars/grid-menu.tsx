import { GridFourIcon } from "@phosphor-icons/react/dist/ssr";
import { useEditor, useEditorActions } from "~/editor/use-editor-store";
import { MIN_GRID_SIZE, MAX_GRID_SIZE } from "~/editor/grid";
import { NumberInput } from "~/components/ui/number-input";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "~/components/ui/dropdown-menu";

export function GridMenu() {
  const grid = useEditor((state) => state.grid);
  const isPlayMode = useEditor((state) => state.isPlayMode);
  const { setGrid } = useEditorActions();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        openOnHover
        disabled={isPlayMode}
        iconBefore={<GridFourIcon />}
      >
        Grid
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
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
        <DropdownMenuSeparator />
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
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
