import "server-only";
import postgres from "postgres";

// The pooled Neon DATABASE_URL remains on the server. Never use NEXT_PUBLIC_ for it.
// prepare:false supports PgBouncer transaction pooling; connections are reused on warm invocations.
const store = globalThis as typeof globalThis & { __ekmivoDb?: ReturnType<typeof postgres> };

export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!store.__ekmivoDb) store.__ekmivoDb = postgres(url, {
    ssl: process.env.NODE_ENV==="development"&&["127.0.0.1","localhost","[::1]"].includes(new URL(url).hostname)?false:"require", max: 4, idle_timeout: 15, connect_timeout: 8, prepare: false,
    transform: { undefined: null }
  });
  return store.__ekmivoDb;
}
