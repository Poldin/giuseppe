"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, Package, Plus, Minus, ChevronDown, CheckCircle2, Circle, Trash2 } from "lucide-react";
import AddFabbisognoDialog from "@/app/components/warehouse/AddFabbisognoDialog";
import AIBotWidget from "@/app/components/warehouse/AIBotWidget";
import { supabase } from "@/app/lib/SupabaseClient";

// Importiamo le funzioni create in precedenza
import { getReordersByWarehouse, getWarehouseById, createReorder, updateReorderNotes, updateReorderStatus, updateReorderQuantity, deleteReorder } from "@/app/warehouse/[id]/actions";

export interface FabbisognoItem {
    id: string;
    product_name: string;   // Cambiato in snake_case per allinearsi al DB
    notes: string | null;   // Cambiato in notes
    completed_at: string | null; // Gestito tramite timestamp nullo/presente
    warehouse_id: string | null;
    created_at: string;
    quantity: number;
}

interface FabbisognoContentProps {
    warehouseId: string;
}

function formatFabbisognoDate(iso: string) {
    return new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(iso));
}

function getNotePreview(notes: string) {
    return notes.split("\n")[0]?.trim() ?? "";
}

export default function FabbisognoContent({ warehouseId }: FabbisognoContentProps) {
    const [items, setItems] = useState<FabbisognoItem[]>([]);
    const [warehouseName, setWarehouseName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [filter, setFilter] = useState<"tutti" | "attivi" | "completati">("attivi");
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [tempNoteText, setTempNoteText] = useState<string>("");
    const [deleteTarget, setDeleteTarget] = useState<FabbisognoItem | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const skipNextNoteBlurSave = useRef(false);

    // 1. CARICAMENTO DATI + REALTIME
    useEffect(() => {
        if (!warehouseId) return;

        async function loadData() {
            setLoading(true);
            const [reordersResult, warehouseResult] = await Promise.all([
                getReordersByWarehouse(warehouseId),
                getWarehouseById(warehouseId),
            ]);
            if (!reordersResult.error && reordersResult.data) {
                setItems(reordersResult.data as FabbisognoItem[]);
            }
            if (!warehouseResult.error && warehouseResult.data) {
                setWarehouseName(warehouseResult.data.w_name ?? null);
            }
            setLoading(false);
        }

        loadData();

        const channel = supabase
            .channel(`reorders:${warehouseId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "reorders",
                    filter: `warehouse_id=eq.${warehouseId}`,
                },
                (payload) => {
                    if (payload.eventType === "INSERT") {
                        const row = payload.new as FabbisognoItem;
                        setItems((prev) =>
                            prev.some((item) => item.id === row.id) ? prev : [row, ...prev]
                        );
                        return;
                    }

                    if (payload.eventType === "UPDATE") {
                        const row = payload.new as FabbisognoItem;
                        setItems((prev) =>
                            prev.map((item) => (item.id === row.id ? row : item))
                        );
                        return;
                    }

                    if (payload.eventType === "DELETE") {
                        const row = payload.old as { id: string };
                        setItems((prev) => prev.filter((item) => item.id !== row.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [warehouseId]);

    // 2. TOGGLE COMPLETATO / ATTIVO (MUTATION)
    const toggleEseguito = async (id: string, currentStatus: boolean) => {
        const now = currentStatus ? null : new Date().toISOString();
        setItems(prev => prev.map(item => item.id === id ? { ...item, completed_at: now } : item));
        await updateReorderStatus(id, now);
    };

    // 3. AGGIORNAMENTO NOTE (MUTATION)
    const updateNote = async (id: string, newNote: string) => {
        const trimmedNote = newNote.trim() || null;
        setItems(prev => prev.map(item => item.id === id ? { ...item, notes: trimmedNote } : item));
        setEditingNoteId(null);
        await updateReorderNotes(id, trimmedNote);
    };

    // 3b. AGGIORNAMENTO QUANTITÀ DIRETTAMENTE DALLA RIGA
    const handleUpdateQuantity = async (id: string, currentQuantity: number, increment: boolean) => {
        // Calcola la nuova quantità (minimo 1)
        const newQuantity = increment ? currentQuantity + 1 : Math.max(1, currentQuantity - 1);

        // Se la quantità non cambia (es. provi a scendere sotto 1), fermati
        if (newQuantity === currentQuantity) return;

        // Aggiornamento ottimistico della UI
        setItems(prev => prev.map(item => item.id === id ? { ...item, quantity: newQuantity } : item));

        // Salva sul Database
        const { error } = await updateReorderQuantity(id, newQuantity);
        if (error) {
            console.error("Errore durante l'aggiornamento della quantità:", error);
            // Opzionale: qui potresti ripristinare il valore precedente in caso di errore hard
        }
    };

    // 4. AGGIUNTA NUOVO PRODOTTO (MUTATION)
    const handleAddNewFabbisogno = async (newData: { id?: string; prodotto: string; note: string; quantita: number }) => {
        const { data, error } = await createReorder({
            productName: newData.prodotto,
            notes: newData.note,
            warehouseId: warehouseId,
            quantity: newData.quantita // 👈 Mappa la "quantita" del figlio sulla property "quantity" dell'azione
        });

        if (!error && data) {
            setItems(prev => [data as FabbisognoItem, ...prev]);
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    const handleDeleteReorder = async () => {
        if (!deleteTarget) return;

        setIsDeleting(true);
        const { error } = await deleteReorder(deleteTarget.id);
        setIsDeleting(false);

        if (error) {
            console.error("Errore durante l'eliminazione:", error);
            return;
        }

        setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));
        if (expandedId === deleteTarget.id) setExpandedId(null);
        if (editingNoteId === deleteTarget.id) setEditingNoteId(null);
        setDeleteTarget(null);
    };

    // Filtro logico basato sulla colonna completed_at del DB
    const filteredItems = items.filter((item) => {
        const isEseguito = item.completed_at !== null;
        if (filter === "attivi") return !isEseguito;
        if (filter === "completati") return isEseguito;
        return true;
    });

    if (loading) return <div className="text-center pt-20 font-mono text-xs text-zinc-400">caricamento...</div>;

    return (
        <main className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans antialiased">
            <div className="max-w-3xl mx-auto pt-10 px-1">

                {warehouseName && (
                    <h2 className="px-1 text-sm tracking-tight uppercase">
                        🏰{warehouseName}
                    </h2>
                )}

                {/* Filtro Tab + Aggiungi (desktop: stessa riga, lato opposto) */}
                <div className="my-2 px-1 flex items-center justify-between gap-2">
                    <div className="flex gap-1">
                        <button
                            onClick={() => setFilter("attivi")}
                            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-tight rounded-lg transition-all ${filter === "attivi"
                                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                                : "text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                                }`}
                        >
                            mancano ({items.filter(i => i.completed_at === null).length})
                        </button>
                        <button
                            onClick={() => setFilter("completati")}
                            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-tight rounded-lg transition-all ${filter === "completati"
                                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                                : "text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                                }`}
                        >
                            ✅risolte ({items.filter(i => i.completed_at !== null).length})
                        </button>
                    </div>

                    <AddFabbisognoDialog
                        warehouseId={warehouseId}
                        onAdd={handleAddNewFabbisogno}
                        onUpdateQuantity={handleUpdateQuantity}
                        currentFabbisogno={items}
                    />
                </div>

                {/* Lista dei Prodotti */}
                <div className="space-y-1 pb-24">
                    <AnimatePresence initial={false}>
                        {filteredItems.map((item) => {
                            const isExpanded = expandedId === item.id;
                            const isEditingNote = editingNoteId === item.id;
                            const isEseguito = item.completed_at !== null;
                            const notePreview = item.notes?.trim() ? getNotePreview(item.notes) : "";

                            return (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.97 }}
                                    className={`border rounded-xl transition-all duration-200 ${isEseguito
                                        ? "border-zinc-200 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/20 opacity-60"
                                        : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm"
                                        }`}
                                >
                                    <div className="p-2 flex items-start gap-2 select-none">
                                        {/* Checkbox Spunta passandogli lo stato attuale */}
                                        <button
                                            onClick={() => toggleEseguito(item.id, isEseguito)}
                                            className={`shrink-0 transition-colors ${isEseguito ? "text-green-500" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"}`}
                                        >
                                            {isEseguito ? <CheckCircle2 size={22} className="fill-green-500/10" /> : <Circle size={22} />}
                                        </button>

                                        <div className="flex-1 flex flex-col md:flex-row md:items-center md:justify-between gap-2 min-w-0">
                                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                                                {/* Nome Prodotto - Cliccabile per espandere */}
                                                <div onClick={() => toggleExpand(item.id)} className="cursor-pointer">
                                                    <h2 className={`font-semibold text-sm tracking-tight ${isEseguito ? "line-through text-zinc-400 dark:text-zinc-500" : ""}`}>
                                                        {item.product_name}
                                                    </h2>
                                                </div>

                                                {/* Selettore di Quantità sotto al nome */}
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        disabled={isEseguito || item.quantity <= 1}
                                                        onClick={() => handleUpdateQuantity(item.id, item.quantity || 1, false)}
                                                        className="w-6 h-6 flex items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                    >
                                                        <Minus size={12} />
                                                    </button>

                                                    <span className={`min-w-6 text-center font-mono text-xs font-bold ${isEseguito ? "text-zinc-400" : "text-zinc-800 dark:text-zinc-200"}`}>
                                                        {item.quantity || 1}
                                                    </span>

                                                    <button
                                                        disabled={isEseguito}
                                                        onClick={() => handleUpdateQuantity(item.id, item.quantity || 1, true)}
                                                        className="w-6 h-6 flex items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                    >
                                                        <Plus size={12} />
                                                    </button>
                                                </div>

                                                {!isExpanded && notePreview && (
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleExpand(item.id)}
                                                        className={`mt-0.5 w-full text-left text-xs leading-snug line-clamp-1 transition-colors ${isEseguito
                                                            ? "text-zinc-400 hover:text-zinc-500"
                                                            : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                                                            }`}
                                                        title={item.notes ?? undefined}
                                                    >
                                                        {notePreview}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => toggleExpand(item.id)}
                                            className={`text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all ${isExpanded ? "rotate-180" : ""}`}
                                        >
                                            <ChevronDown size={18} />
                                        </button>
                                    </div>

                                    {/* Dettagli Espandibili */}
                                    <AnimatePresence initial={false}>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden bg-zinc-50/50 dark:bg-zinc-900/40 rounded-b-xl"
                                            >
                                                <div className="p-2 text-xs space-y-2 text-zinc-600 dark:text-zinc-400 font-sans">
                                                    <div>
                                                        {isEditingNote ? (
                                                            <div className="mt-1 space-y-1">
                                                                <textarea
                                                                    value={tempNoteText}
                                                                    onChange={(e) => setTempNoteText(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                                                            e.preventDefault();
                                                                            updateNote(item.id, tempNoteText);
                                                                        }
                                                                        if (e.key === "Escape") {
                                                                            skipNextNoteBlurSave.current = true;
                                                                            setEditingNoteId(null);
                                                                        }
                                                                    }}
                                                                    onBlur={() => {
                                                                        if (skipNextNoteBlurSave.current) {
                                                                            skipNextNoteBlurSave.current = false;
                                                                            return;
                                                                        }
                                                                        updateNote(item.id, tempNoteText);
                                                                    }}
                                                                    rows={3}
                                                                    className="w-full min-h-[72px] resize-y px-2 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none whitespace-pre-wrap"
                                                                    autoFocus
                                                                />
                                                                <p className="text-[10px] text-zinc-400">
                                                                    Invio per andare a capo · Ctrl+Invio per salvare
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            <p
                                                                onClick={() => {
                                                                    if (isEseguito) return;
                                                                    setEditingNoteId(item.id);
                                                                    setTempNoteText(item.notes || "");
                                                                }}
                                                                className={`p-2 rounded-lg bg-zinc-100/50 dark:bg-zinc-800/30 border border-transparent transition-all text-sm whitespace-pre-wrap ${isEseguito ? "text-zinc-400 cursor-not-allowed" : "text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer hover:bg-white dark:hover:bg-zinc-800"}`}
                                                            >
                                                                {item.notes ? item.notes : <span className="italic text-zinc-400 text-xs">aggiungi nota..</span>}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-800/80 space-y-1">
                                                        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                                                            Aggiunto:{" "}
                                                            <span className="normal-case tracking-normal text-zinc-500 dark:text-zinc-400">
                                                                {formatFabbisognoDate(item.created_at)}
                                                            </span>
                                                        </p>
                                                        {item.completed_at && (
                                                            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                                                                Completato:{" "}
                                                                <span className="normal-case tracking-normal text-zinc-500 dark:text-zinc-400">
                                                                    {formatFabbisognoDate(item.completed_at)}
                                                                </span>
                                                            </p>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteTarget(item)}
                                                            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-tight rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                                        >
                                                            <Trash2 size={13} />
                                                            Elimina
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            </div>
            <AnimatePresence>
                {deleteTarget && (
                    <div key="delete-confirm-backdrop" className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-sm p-4">
                        <motion.div
                            key="delete-confirm"
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className="w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
                        >
                            <div className="p-5 space-y-3">
                                <h3 className="font-black text-sm uppercase tracking-tighter text-zinc-900 dark:text-zinc-50">
                                    Elimina
                                </h3>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                    Vuoi eliminare definitivamente{" "}
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                        {deleteTarget.product_name}
                                    </span>
                                    ? L&apos;operazione non può essere annullata.
                                </p>
                                <div className="flex gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setDeleteTarget(null)}
                                        disabled={isDeleting}
                                        className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors disabled:opacity-50"
                                    >
                                        Annulla
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDeleteReorder}
                                        disabled={isDeleting}
                                        className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-red-700 transition-colors disabled:opacity-50"
                                    >
                                        {isDeleting ? "Eliminazione..." : "Elimina"}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            <AIBotWidget />
        </main>
    );
}