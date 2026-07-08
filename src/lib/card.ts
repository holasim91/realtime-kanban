import { supabase } from "./supabase";
import type { Card } from "./type";

export async function loadCards(): Promise<Record<string, Card>> {
  const { data, error } = await supabase
    .from("cards")
    .select("id, column_id, title, position, updated_at");

  if (error) throw error;

  const byId: Record<string, Card> = {};
  for (const row of data) {
    byId[row.id] = {
      id: row.id,
      title: row.title,
      columnId: row.column_id,
      order: row.position, // DB position → 앱 order
      updatedAt: row.updated_at,
    };
  }
  return byId;
}
