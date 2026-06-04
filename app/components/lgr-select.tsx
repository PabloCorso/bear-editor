import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectTriggerIcon,
  SelectValue,
} from "~/components/ui/select";
import { useLgrAssets } from "./use-lgr-assets";

const ADD_NEW_LGR_VALUE = "__add-new-lgr__";

type LgrSelectProps = {
  value: string;
  onValueChange: (levelName: string) => void;
  className?: string;
  "aria-label"?: string;
};

export function LgrSelect({
  value,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: LgrSelectProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lgrAssets = useLgrAssets();
  const options = getVisibleOptions({
    value,
    options: lgrAssets.lgrOptions,
  });

  return (
    <>
      <Select
        value={value || "default"}
        onValueChange={(nextValue) => {
          if (!nextValue) return;
          if (nextValue === ADD_NEW_LGR_VALUE) {
            fileInputRef.current?.click();
            return;
          }

          onValueChange(nextValue);
          void afterNextPaint().then(function selectLgrAfterPaint() {
            return lgrAssets.selectLgr(nextValue);
          });
        }}
      >
        <SelectTrigger className={className} aria-label={ariaLabel}>
          <SelectValue>
            {(selectedValue: string | null) =>
              getOptionLabel(options, selectedValue ?? "default")
            }
          </SelectValue>
          <SelectTriggerIcon />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.levelName} value={option.levelName}>
              {option.name}
            </SelectItem>
          ))}
          <SelectItem value={ADD_NEW_LGR_VALUE} iconBefore={<PlusIcon />}>
            Add new LGR
          </SelectItem>
        </SelectContent>
      </Select>
      <input
        ref={fileInputRef}
        type="file"
        accept=".lgr"
        className="hidden"
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;

          const result = await lgrAssets.loadLgrFile(file);
          if (result) onValueChange(result.levelName);
        }}
      />
    </>
  );
}

function getVisibleOptions({
  value,
  options,
}: {
  value: string;
  options: Array<{ name: string; levelName: string }>;
}) {
  if (
    !value ||
    options.some((option) => isSameOptionValue(option.levelName, value))
  ) {
    return options;
  }

  return [
    ...options,
    {
      name: `${value}.lgr`,
      levelName: value,
    },
  ];
}

function getOptionLabel(
  options: Array<{ name: string; levelName: string }>,
  value: string,
) {
  return (
    options.find((option) => isSameOptionValue(option.levelName, value))
      ?.name ?? `${value}.lgr`
  );
}

function isSameOptionValue(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function afterNextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(function resolveAfterNextPaint() {
        resolve();
      });
      return;
    }

    setTimeout(resolve, 0);
  });
}
