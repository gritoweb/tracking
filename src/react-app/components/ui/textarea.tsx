import * as React from "react"

import { cn } from "@/lib/utils"
import { textareaVariants } from "@/components/ui/textarea-variants"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(textareaVariants(), className)}
      {...props}
    />
  )
}

export { Textarea }
