import * as React from "react"
import { UserPlus } from "lucide-react"

import { SlotButton } from "@/components/ui/slot-button"

type AssignButtonProps = Omit<React.ComponentProps<typeof SlotButton>, "children" | "aria-label"> & {
  "aria-label"?: string
}

/** The empty assignee slot: a `SlotButton` with the add-person icon. */
function AssignButton({ "aria-label": ariaLabel = "Add assignee", ...props }: AssignButtonProps) {
  return (
    <SlotButton aria-label={ariaLabel} {...props}>
      <UserPlus />
    </SlotButton>
  )
}

export { AssignButton }
