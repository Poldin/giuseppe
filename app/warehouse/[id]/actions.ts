import { supabase } from "@/app/lib/SupabaseClient";

// Definizione opzionale ma consigliata dei tipi per i parametri di creazione
interface CreateReorderInput {
  productName: string;
  notes: string | null;
  warehouseId: string;
  quantity: number;
}

/**
 * 1. Recupera tutti i riordini di uno specifico magazzino, 
 * includendo i dettagli del magazzino stesso (JOIN)
 */
export const getReordersByWarehouse = async (warehouseId: string) => {
  try {
    const { data, error } = await supabase
      .from('reorders')
      .select(`
        *,
        whearhouses (
          id,
          w_name
        )
      `)
      .eq('warehouse_id', warehouseId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    console.error("Errore nel recupero dei riordini:", error.message);
    return { data: null, error };
  }
};

/**
 * 2. Aggiunge un nuovo prodotto al riordine per un magazzino specifico
 */
export const createReorder = async ({ productName, notes, warehouseId, quantity }: CreateReorderInput) => {
  try {
    const { data, error } = await supabase
      .from('reorders')
      .insert([
        {
          product_name: productName,
          notes: notes,
          warehouse_id: warehouseId,
          quantity: quantity
        }
      ])
      .select(); 

    if (error) throw error;
    return { data: data ? data[0] : null, error: null };
  } catch (error: any) {
    console.error("Errore nell'inserimento del riordine:", error.message);
    return { data: null, error };
  }
};

/**
 * 3. Utility: Recupera la lista dei magazzini
 */
export const getWarehouses = async () => {
  try {
    const { data, error } = await supabase
      .from('whearhouses')
      .select('*')
      .order('w_name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    console.error("Errore nel recupero dei magazzini:", error.message);
    return { data: null, error };
  }
};

export const updateReorderStatus = async (id: string, completedAt: string | null) => {
  try {
    const { data, error } = await supabase
      .from('reorders')
      .update({ completed_at: completedAt })
      .eq('id', id)
      .select();

    if (error) throw error;
    return { data: data ? data[0] : null, error: null };
  } catch (error: any) {
    console.error("Errore nell'aggiornamento dello stato:", error.message);
    return { data: null, error };
  }
};

export const updateReorderNotes = async (id: string, notes: string | null) => {
  try {
    const { data, error } = await supabase
      .from('reorders')
      .update({ notes: notes })
      .eq('id', id)
      .select();

    if (error) throw error;
    return { data: data ? data[0] : null, error: null };
  } catch (error: any) {
    console.error("Errore nell'aggiornamento delle note:", error.message);
    return { data: null, error };
  }
};

export type ReorderSearchProduct = {
  id: string;
  nome: string;
};

/**
 * Ricerca prodotti tra i riordini passati del magazzino.
 * Senza testo: ultimi 10 nomi distinti per data di creazione.
 * Con testo: filtra per product_name (case-insensitive).
 */
export const searchReorderProducts = async (
  warehouseId: string,
  search: string
): Promise<{ data: ReorderSearchProduct[] | null; error: unknown }> => {
  try {
    let query = supabase
      .from("reorders")
      .select("id, product_name, created_at")
      .eq("warehouse_id", warehouseId)
      .not("product_name", "is", null)
      .order("created_at", { ascending: false });

    const trimmed = search.trim();
    if (trimmed !== "") {
      query = query.ilike("product_name", `%${trimmed}%`);
    }

    const { data, error } = await query.limit(50);

    if (error) throw error;

    const seen = new Set<string>();
    const unique: ReorderSearchProduct[] = [];

    for (const row of data ?? []) {
      const name = row.product_name?.trim();
      if (!name) continue;

      const key = name.toLowerCase();
      if (seen.has(key)) continue;

      seen.add(key);
      unique.push({ id: row.id, nome: name });
      if (unique.length >= 10) break;
    }

    return { data: unique, error: null };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto";
    console.error("Errore nella ricerca dei riordini:", message);
    return { data: null, error };
  }
};

export const updateReorderQuantity = async (id: string, quantity: number) => {
  try {
    const { data, error } = await supabase
      .from('reorders')
      .update({ quantity: quantity })
      .eq('id', id)
      .select();

    if (error) throw error;
    return { data: data ? data[0] : null, error: null };
  } catch (error: any) {
    console.error("Errore nell'aggiornamento della quantità:", error.message);
    return { data: null, error };
  }
};