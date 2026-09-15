import { SparklesIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ComposerControl, ComposerControlIcon, type ComposerControlSize } from "./ComposerControl";

export function ComposerWorkflowActionsControl(props: {
  readonly compact: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly size?: ComposerControlSize;
}) {
  const size = props.size ?? "sm";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ComposerControl
            type="button"
            size={size}
            className={cn(
              "shrink-0",
              props.open && "bg-accent text-accent-foreground hover:bg-accent/80",
            )}
            aria-label="Agent Actions"
            onPointerDown={(event) => event.preventDefault()}
            onClick={props.onToggle}
          />
        }
      >
        <ComposerControlIcon icon={SparklesIcon} size={size} />
        <span className={props.compact ? "sr-only" : undefined}>Actions</span>
      </TooltipTrigger>
      <TooltipPopup side="top">Browse prompts and skills from this environment</TooltipPopup>
    </Tooltip>
  );
}
