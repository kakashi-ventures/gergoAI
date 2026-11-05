import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service role solo lato server (route /api/tools). Mai nel client.
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY mancanti");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export const BRIDGE_ID = () => process.env.BRIDGE_ID || "pavia-postazione-1";

export async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}
