"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Search, ChevronDown, ChevronUp, Undo2, Minus, ArrowLeft } from "lucide-react";
import { FabbisognoItem } from "./fabbisogno";
import { searchReorderProducts } from "@/app/warehouse/[id]/actions";

type InventarioProduct = {
    id: string;
    nome: string;
};

// Aggiornato per supportare l'ID del prodotto dell'inventario
type NewItemData = {
    id?: string;
    prodotto: string;
    note: string;
    quantita: number;
};

interface AddFabbisognoDialogProps {
    warehouseId: string;
    onAdd: (item: NewItemData) => void;
    onUpdateQuantity: (id: string, currentQuantity: number, increment: boolean) => void;
    currentFabbisogno: FabbisognoItem[];
}

type ProductEditState = {
    quantita: number;
    note: string;
    isExpanded: boolean;
};

export default function AddFabbisognoDialog({ warehouseId, onAdd, onUpdateQuantity, currentFabbisogno }: AddFabbisognoDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isManualMode, setIsManualMode] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Stato manuale singolo
    const [manualNome, setManualNome] = useState("");
    const [manualNote, setManualNote] = useState("");
    const [manualQuantita, setManualQuantita] = useState(1);
    const [manualExpanded, setManualExpanded] = useState(false);

    // Mappa degli stati modificati dell'inventario
    const [editStates, setEditStates] = useState<Record<string, ProductEditState>>({});
    const [animatingProductId, setAnimatingProductId] = useState<string | null>(null);
    const [searchResults, setSearchResults] = useState<InventarioProduct[]>([]);

    useEffect(() => {
        if (!isOpen || !warehouseId || isManualMode) return;

        let cancelled = false;
        const debounceMs = searchQuery.trim() ? 200 : 0;

        const timeoutId = window.setTimeout(async () => {
            setIsLoading(true);
            const { data, error } = await searchReorderProducts(warehouseId, searchQuery);
            if (!cancelled) {
                if (!error && data) {
                    setSearchResults(data);
                } else {
                    setSearchResults([]);
                }
                setIsLoading(false);
            }
        }, debounceMs);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [isOpen, warehouseId, searchQuery, isManualMode]);

    const getRowState = (id: string): ProductEditState => {
        return editStates[id] || { quantita: 1, note: "", isExpanded: false };
    };

    const updateRowState = (id: string, updates: Partial<ProductEditState>) => {
        setEditStates((prev) => {
            const current = prev[id] || { quantita: 1, note: "", isExpanded: false };
            return {
                ...prev,
                [id]: { ...current, ...updates }
            };
        });
    };

    const resetRow = (id: string) => {
        setEditStates((prev) => {
            const newState = { ...prev };
            delete newState[id];
            return newState;
        });
    };

    const handleClose = () => {
        setIsOpen(false);
        setSearchQuery("");
        setSearchResults([]);
        setManualNome("");
        setManualNote("");
        setManualQuantita(1);
        setManualExpanded(false);
        setEditStates({});
        setIsManualMode(false);
    };

    const matchesProductName = (item: FabbisognoItem, nomeProdotto: string) =>
        item.product_name?.toLowerCase() === nomeProdotto.toLowerCase();

    const getActiveItems = (nomeProdotto: string) =>
        currentFabbisogno.filter(
            (item) => item.completed_at === null && matchesProductName(item, nomeProdotto)
        );

    const getActiveItem = (nomeProdotto: string) => {
        const activeItems = getActiveItems(nomeProdotto);
        if (activeItems.length === 0) return null;

        return activeItems.sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];
    };

    const hasCompletedOnly = (nomeProdotto: string) => {
        if (getActiveItems(nomeProdotto).length > 0) return false;

        return currentFabbisogno.some(
            (item) => item.completed_at !== null && matchesProductName(item, nomeProdotto)
        );
    };

    const getGiaSegnati = (nomeProdotto: string) =>
        getActiveItems(nomeProdotto).reduce((sum, item) => sum + (item.quantity || 1), 0);

    const handleSendToFabbisogno = (id: string, nomeProdotto: string) => {
        const state = getRowState(id);

        setAnimatingProductId(id);

        // MODIFICA: Passiamo anche l'ID per permettere al padre di fare controlli/coincidenze
        onAdd({
            id: id,
            prodotto: nomeProdotto,
            quantita: state.quantita,
            note: state.note
        });

        resetRow(id);

        setTimeout(() => {
            setAnimatingProductId(null);
        }, 400);
    };

    const handleCreateManual = (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualNome.trim()) return;

        // Per l'inserimento manuale non passiamo l'id dell'inventario
        onAdd({ prodotto: manualNome, quantita: manualQuantita, note: manualNote });

        handleClose();
    };

    return (
        <>
            <div className="w-full md:w-auto">
                <button
                    onClick={() => setIsOpen(true)}
                    className="w-fit rounded-xl md:w-auto flex items-center justify-center gap-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-sm uppercase tracking-tight px-6 py-4 md:py-2.5 md:rounded-xl fixed md:relative bottom-1 left-1 md:bottom-auto md:right-auto z-40 md:z-0 shadow-lg md:shadow-none hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors duration-200"
                >
                    <Plus size={18} /> Aggiungi
                </button>
            </div>

            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-sm p-0 md:p-4">
                        <motion.div
                            initial={{ opacity: 0, y: typeof window !== "undefined" && window.innerWidth < 768 ? "100%" : 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: typeof window !== "undefined" && window.innerWidth < 768 ? "100%" : 20 }}
                            transition={{ type: "spring", damping: 25, stiffness: 250 }}
                            className="w-full h-full md:h-[85vh] md:max-w-xl bg-white dark:bg-zinc-950 md:rounded-2xl border-x md:border border-zinc-200 dark:border-zinc-800 flex flex-col shadow-2xl overflow-hidden"
                        >
                            {/* Header del Dialog */}
                            <header className="p-4 flex justify-between items-center border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/20">
                                <h3 className="font-black text-base uppercase tracking-tighter text-zinc-900 dark:text-zinc-50">
                                    {isManualMode ? "Aggiungi Manuale" : "Aggiungi Prodotto"}
                                </h3>
                                <button
                                    onClick={handleClose}
                                    className="p-1 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </header>

                            {/* Corpo del Dialog */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">

                                {/* 1. MODALITÀ: RICERCA INVENTARIO */}
                                {!isManualMode ? (
                                    <>
                                        <div className="relative shrink-0">
                                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                            <input
                                                type="text"
                                                placeholder="cerca..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 font-sans text-zinc-900 dark:text-zinc-100"
                                            />
                                        </div>

                                        {/* Lista Prodotti con Scroll Indipendente */}
                                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[200px]">
                                            {isLoading ? (
                                                <p className="text-xs text-zinc-400 italic text-center py-8">
                                                    ricerca in corso...
                                                </p>
                                            ) : searchResults.length > 0 ? (
                                                searchResults.map((prod) => {
                                                    const rState = getRowState(prod.id);
                                                    const activeItem = getActiveItem(prod.nome);
                                                    const isActiveInFabbisogno = activeItem !== null;
                                                    const showGiaCercato = hasCompletedOnly(prod.nome);
                                                    const giaSegnati = getGiaSegnati(prod.nome);
                                                    const displayQuantita = isActiveInFabbisogno
                                                        ? activeItem.quantity || 1
                                                        : rState.quantita;
                                                    const isModified =
                                                        !isActiveInFabbisogno &&
                                                        (rState.quantita !== 1 || rState.note.trim() !== "");
                                                    const isAnimating = animatingProductId === prod.id;

                                                    const handleQuantitaChange = (increment: boolean) => {
                                                        if (isActiveInFabbisogno && activeItem) {
                                                            onUpdateQuantity(
                                                                activeItem.id,
                                                                activeItem.quantity || 1,
                                                                increment
                                                            );
                                                            return;
                                                        }

                                                        const nextQuantita = increment
                                                            ? rState.quantita + 1
                                                            : Math.max(1, rState.quantita - 1);
                                                        updateRowState(prod.id, { quantita: nextQuantita });
                                                    };

                                                    return (
                                                        <motion.div
                                                            key={prod.id}
                                                            animate={isAnimating ? { scale: [1, 0.96, 1.02, 1] } : { scale: 1 }}
                                                            transition={{ duration: 0.35, ease: "easeInOut" }}
                                                            className={`rounded-xl border transition-colors duration-200 p-3 flex flex-col gap-2.5 ${isAnimating
                                                                    ? "bg-amber-500/10 border-amber-500 dark:border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)] ring-1 ring-amber-500/30"
                                                                    : isModified
                                                                        ? "border-zinc-400 dark:border-zinc-500 shadow-sm bg-white dark:bg-zinc-900/40"
                                                                        : "border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40"
                                                                }`}
                                                        >
                                                            <div className="flex items-start gap-2 w-full">
                                                                <AnimatePresence>
                                                                    {isModified && (
                                                                        <motion.button
                                                                            initial={{ opacity: 0, scale: 0.8 }}
                                                                            animate={{ opacity: 1, scale: 1 }}
                                                                            exit={{ opacity: 0, scale: 0.8 }}
                                                                            onClick={() => resetRow(prod.id)}
                                                                            className="p-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-red-500 transition-colors mt-0.5"
                                                                            title="Annulla modifiche"
                                                                        >
                                                                            <Undo2 size={14} />
                                                                        </motion.button>
                                                                    )}
                                                                </AnimatePresence>

                                                                <div className="flex-1 min-w-0 flex flex-col">
                                                                    {isActiveInFabbisogno && giaSegnati > 0 && (
                                                                        <motion.span
                                                                            animate={isAnimating ? { y: [0, -6, 2, 0], scale: [1, 1.1, 1] } : { y: 0, scale: 1 }}
                                                                            transition={{ duration: 0.35 }}
                                                                            className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 origin-left ${isAnimating ? "text-amber-500 dark:text-amber-400" : "text-zinc-400 dark:text-zinc-500"
                                                                                }`}
                                                                        >
                                                                            già <span className="text-amber-600 dark:text-amber-400 font-extrabold font-mono text-xs">{giaSegnati} pezzi</span>
                                                                        </motion.span>
                                                                    )}

                                                                    {showGiaCercato && (
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider mb-0.5 text-zinc-400 dark:text-zinc-500">
                                                                            già cercato
                                                                        </span>
                                                                    )}

                                                                    <span className="text-sm font-semibold tracking-tight text-zinc-800 dark:text-zinc-200 wrap-break-word">
                                                                        {prod.nome}
                                                                    </span>
                                                                </div>

                                                                {!isActiveInFabbisogno && (
                                                                    <button
                                                                        onClick={() => handleSendToFabbisogno(prod.id, prod.nome)}
                                                                        className={`p-2 rounded-xl flex items-center justify-center transition-colors shrink-0 ${isAnimating
                                                                                ? "bg-amber-600 text-white"
                                                                                : isModified
                                                                                    ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 hover:bg-zinc-700"
                                                                                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                                                            }`}
                                                                        title="Invia al fabbisogno"
                                                                    >
                                                                        <Plus size={16} />
                                                                    </button>
                                                                )}
                                                            </div>

                                                            <div className="flex items-center justify-between pt-0.5">
                                                                <div className="flex items-center gap-1.5">
                                                                    <button
                                                                        onClick={() => handleQuantitaChange(false)}
                                                                        disabled={isActiveInFabbisogno && displayQuantita <= 1}
                                                                        className="w-6 h-6 flex items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                                    >
                                                                        <Minus size={12} />
                                                                    </button>
                                                                    <span className="w-6 text-center font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200">
                                                                        {displayQuantita}
                                                                    </span>
                                                                    <button
                                                                        onClick={() => handleQuantitaChange(true)}
                                                                        className="w-6 h-6 flex items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                                                                    >
                                                                        <Plus size={12} />
                                                                    </button>
                                                                </div>

                                                                {!isActiveInFabbisogno && (
                                                                    <button
                                                                        onClick={() => updateRowState(prod.id, { isExpanded: !rState.isExpanded })}
                                                                        className="text-[11px] font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 uppercase tracking-tight flex items-center gap-1"
                                                                    >
                                                                        <span>Note</span>
                                                                        {rState.isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                                    </button>
                                                                )}
                                                            </div>

                                                            <AnimatePresence>
                                                                {!isActiveInFabbisogno && rState.isExpanded && (
                                                                    <motion.div
                                                                        initial={{ height: 0, opacity: 0 }}
                                                                        animate={{ height: "auto", opacity: 1 }}
                                                                        exit={{ height: 0, opacity: 0 }}
                                                                        className="overflow-hidden"
                                                                    >
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Aggiungi una nota per questo materiale..."
                                                                            value={rState.note}
                                                                            onChange={(e) => updateRowState(prod.id, { note: e.target.value })}
                                                                            className="w-full mt-1 px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:border-zinc-400 font-sans text-zinc-900 dark:text-zinc-100"
                                                                        />
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </motion.div>
                                                    );
                                                })
                                            ) : (
                                                <p className="text-xs text-zinc-400 italic text-center py-8">
                                                    {searchQuery.trim()
                                                        ? "Nessun prodotto trovato nei riordini precedenti."
                                                        : "Nessun riordino precedente per questo magazzino."}
                                                </p>
                                            )}
                                        </div>

                                        {/* Footer di navigazione interna */}
                                        <div className="space-y-2 shrink-0">
                                            <button
                                                onClick={() => setIsManualMode(true)}
                                                className="w-full py-3 text-xs font-bold uppercase tracking-wide text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl text-center transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/20"
                                            >
                                                ✨ Non trovi? Aggiungi manualmente
                                            </button>
                                            <div className="flex justify-center">
                                                <button
                                                    type="button"
                                                    onClick={handleClose}
                                                    className="inline-flex items-center justify-center gap-2 px-8 py-3 text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-colors"
                                                >
                                                    <ArrowLeft size={14} />
                                                    Indietro
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    /* 2. MODALITÀ: INSERIMENTO MANUALE */
                                    <form onSubmit={handleCreateManual} className="space-y-4 flex-1 flex flex-col justify-between">
                                        <div className={`p-4 rounded-xl transition-all border ${manualNome.trim() ? 'border-zinc-400 dark:border-zinc-500 bg-white dark:bg-zinc-900/20' : 'border-zinc-200 dark:border-zinc-800'}`}>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-mono uppercase text-zinc-400 tracking-wider">Nome Prodotto *</label>
                                                <input
                                                    type="text"
                                                    required
                                                    autoFocus
                                                    placeholder="Inserisci il nome del nuovo materiale..."
                                                    value={manualNome}
                                                    onChange={(e) => setManualNome(e.target.value)}
                                                    className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-zinc-400 text-zinc-900 dark:text-zinc-100"
                                                />
                                            </div>

                                            <div className="flex items-center justify-between pt-4">
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => setManualQuantita(Math.max(1, manualQuantita - 1))}
                                                        className="w-6 h-6 flex items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                                                    >
                                                        <Minus size={12} />
                                                    </button>
                                                    <span className="w-6 text-center font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200">{manualQuantita}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setManualQuantita(manualQuantita + 1)}
                                                        className="w-6 h-6 flex items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                                                    >
                                                        <Plus size={12} />
                                                    </button>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => setManualExpanded(!manualExpanded)}
                                                    className="text-[11px] font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 uppercase tracking-tight flex items-center gap-1"
                                                >
                                                    <span>Note</span>
                                                    {manualExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                </button>
                                            </div>

                                            <AnimatePresence>
                                                {manualExpanded && (
                                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-2">
                                                        <input
                                                            type="text"
                                                            placeholder="Aggiungi una nota per questo inserimento..."
                                                            value={manualNote}
                                                            onChange={(e) => setManualNote(e.target.value)}
                                                            className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none font-sans text-zinc-900 dark:text-zinc-100"
                                                        />
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        {/* Bottoni di Invio / Indietro */}
                                        <div className="flex gap-2 bg-white dark:bg-zinc-950 mt-auto">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsManualMode(false);
                                                    setManualNome("");
                                                    setManualNote("");
                                                    setManualQuantita(1);
                                                    setManualExpanded(false);
                                                }}
                                                className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                                            >
                                                Annulla
                                            </button>
                                            <button
                                                type="submit"
                                                className="flex-1 py-3 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1"
                                            >
                                                Aggiungi
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}