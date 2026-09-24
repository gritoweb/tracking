import { cva } from "class-variance-authority"

// A card picked up for drag renders in a portal, floating free of the board: an overlay, so it carries the overlay shadow.
export const dragOverlayVariants = cva("shadow-lg")
