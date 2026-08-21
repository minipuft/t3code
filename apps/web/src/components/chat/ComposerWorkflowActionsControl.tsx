import { SparklesIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ComposerControl, ComposerControlIcon } from "./ComposerControl";

export function ComposerWorkflowActionsControl(props: {
  readonly compact: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ComposerControl
            type="button"
            className={cn("shrink-0", props.open && "bg-accent text-accent-foreground")}
            aria-label="Agent Actions"
            onPointerDown={(event) => event.preventDefault()}
            onClick={props.onToggle}
          />
        }
      >
        <ComposerControlIcon icon={SparklesIcon} />
        <span className={props.compact ? "sr-only" : undefined}>Actions</span>
      </TooltipTrigger>
      <TooltipPopup side="top">Browse prompts and skills from this environment</TooltipPopup>
    </Tooltip>
  );
}
