import * as React from "react"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

interface SearchInputProps extends React.ComponentProps<typeof Input> {
  containerClassName?: string
}

// Composes Input rather than forking it, so a future Input change (DS-1's CVA pass) reaches this too.
const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, containerClassName, ...props }, ref) => (
    <div className={cn("relative", containerClassName)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input ref={ref} data-slot="search-input" className={cn("pl-8", className)} {...props} />
    </div>
  )
)
SearchInput.displayName = "SearchInput"

export { SearchInput }
