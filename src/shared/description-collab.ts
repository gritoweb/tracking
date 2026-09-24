/** Custom messages between a DescriptionRoom and its editors, asking who may seed an empty room from D1. */
export const SEED_REQUEST = "seed?";
export const SEED_GRANTED = "seed:ok";
export const SEED_DENIED = "seed:no";

/** The Yjs field the tiptap Collaboration extension writes to (its default). */
export const DESCRIPTION_FIELD = "default";

/** One room per task, scoped by workspace so an id can never reach another tenant's room. */
export const descriptionRoomName = (workspaceId: string, taskId: string) => `${workspaceId}:${taskId}`;
