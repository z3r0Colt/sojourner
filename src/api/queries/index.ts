/**
 * The app's data hooks: every read and write the screens make, as React
 * Query hooks over `api/client`. They are kept by the part of the app they
 * serve, one file each, and all exported from here, so a screen imports from
 * "api/queries" whichever file a hook is in.
 */
export * from "./scripture";
export * from "./annotations";
export * from "./study";
export * from "./resources";
export * from "./reference";
export * from "./prayer";
export * from "./memory";
export * from "./plans";
export * from "./system";
export * from "./passageExtras";
export * from "./sermons";

export type { Verse } from "../types";
