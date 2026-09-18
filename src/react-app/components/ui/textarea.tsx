import * as React from "react"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { textareaVariants } from "@/components/ui/textarea-variants"

// `field-sizing: content` lets a field grow with its text; where it is missing, a field that must not scroll measures itself.
const growsByItself = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content")

function Textarea({
  className,
  variant,
  ref,
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof textareaVariants>) {
  const own = React.useRef<HTMLTextAreaElement | null>(null)

  const setRef = React.useCallback(
    (el: HTMLTextAreaElement | null) => {
      own.current = el
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    },
    [ref]
  )

  // These variants never scroll, so without field-sizing their height has to follow their text.
  React.useLayoutEffect(() => {
    const el = own.current
    if ((variant !== "title" && variant !== "bare") || growsByItself || !el || el.scrollHeight === 0) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  })

  return (
    <textarea
      ref={setRef}
      data-slot="textarea"
      className={cn(textareaVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Textarea }
