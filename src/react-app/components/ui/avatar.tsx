import * as React from "react"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { avatarVariants } from "@/components/ui/avatar-variants"

interface AvatarProps
  extends Omit<React.ComponentProps<"span">, "children">,
    VariantProps<typeof avatarVariants> {
  name?: string | null
  email?: string | null
  image?: string | null
}

function initials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.trim() || ""
  if (!source) return "?"
  const parts = source.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

/** Circular user avatar: renders the image when present (and loads), else initials. */
function Avatar({ name, email, image, size, ring, className, ...props }: AvatarProps) {
  const [broken, setBroken] = React.useState(false)
  const showImage = image && !broken

  return (
    <span
      data-slot="avatar"
      aria-hidden="true"
      className={cn(avatarVariants({ size, ring }), className)}
      {...props}
    >
      {showImage ? (
        <img
          src={image}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        initials(name, email)
      )}
    </span>
  )
}

interface AvatarStackMember {
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
}

interface AvatarStackProps {
  members: AvatarStackMember[]
  max?: number
  size?: VariantProps<typeof avatarVariants>["size"]
  className?: string
}

/** Overlapping avatars with a "+N" tail; the trigger wrapping this owns the accessible name. */
function AvatarStack({ members, max = 3, size = "xs", className }: AvatarStackProps) {
  const visible = members.slice(0, max)
  const overflow = members.length - visible.length

  return (
    <div className={cn("flex shrink-0 -space-x-1.5", className)}>
      {visible.map((member) => (
        <Avatar key={member.id} name={member.name} email={member.email} image={member.image} size={size} ring />
      ))}
      {overflow > 0 && (
        <span
          data-slot="avatar-overflow"
          className={cn(avatarVariants({ size, ring: true }), "bg-muted text-muted-foreground")}
          aria-hidden="true"
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}

export { Avatar, AvatarStack }
