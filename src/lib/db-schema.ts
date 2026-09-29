/**
 * Which Postgres schema Academy OS's tables live in, and which storage bucket
 * holds tenant files. Defaults are the old standalone project ("public",
 * "tenant-assets"); inside the shared Nevorai OS project they are "academy" and
 * "academy-assets". Set VITE_DB_SCHEMA / VITE_STORAGE_BUCKET (baked in at build)
 * so moving, or rolling back, needs no code change.
 *
 * DB_SCHEMA is typed as "public" on purpose: the generated Database type only
 * describes that one schema, and the academy schema has the identical shape.
 */
export const DB_SCHEMA = (import.meta.env.VITE_DB_SCHEMA || "public") as "public";
export const STORAGE_BUCKET: string = import.meta.env.VITE_STORAGE_BUCKET || "tenant-assets";
