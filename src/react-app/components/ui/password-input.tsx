import * as React from "react"
import { Eye, EyeOff } from "lucide-react"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { inputVariants } from "@/components/ui/input-variants"

/** An Input that toggles between masked and plain text — every password field in the account/auth flows shares this instead of a bare `type="password"`. */
function PasswordInput({
  className,
  size,
  variant,
  ...props
}: Omit<React.ComponentProps<"input">, "size" | "type"> & VariantProps<typeof inputVariants>) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        size={size}
        variant={variant}
        className={cn("pr-9", className)}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:bg-transparent"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  )
}

export { PasswordInput }
