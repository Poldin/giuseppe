"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AIBotWidget from "@/app/components/warehouse/AIBotWidget";
import DettaglioProdottoDialog from "./DettaglioProdottoDialog";

// Struttura dati per il singolo Lotto (Batch)
export interface Batch {
    id: string;
    codiceLotto: string;
    scadenza: string;
    quantita: number;
    prezzo?: number;
}

// Struttura dati per il Prodotto dell'Inventario
export interface InventarioItem {
    id: string;
    prodotto: string;
    categoria?: string;
    lotti: Batch[];
}

const initialInventario: InventarioItem[] = [
    {
        id: "i1",
        prodotto: "Composito Fluido A2 - siringhe",
        categoria: "Conservativa",
        lotti: [
            { id: "b1", codiceLotto: "LOT2024-05", scadenza: "2026-12-01", quantita: 5, prezzo: 24.50 },
            { id: "b2", codiceLotto: "LOT2024-09", scadenza: "2027-04-15", quantita: 3, prezzo: 26.00 }
        ]
    },
    {
        id: "i2",
        prodotto: "Fustelle monouso per impronte",
        categoria: "Protesi",
        lotti: [
            { id: "b3", codiceLotto: "BATCH-99A", scadenza: "2029-01-01", quantita: 12, prezzo: 1.20 }
        ]
    },
    {
        id: "i3",
        prodotto: "Soluzione fisiologica sterili 500ml",
        categoria: "Chirurgia",
        lotti: [
            { id: "b4", codiceLotto: "FISIO-01", scadenza: "2026-08-30", quantita: 2, prezzo: 4.10 }
        ]
    }
];

export default function InventarioPage() {
    const [items, setItems] = useState<InventarioItem[]>(initialInventario);
    const [selectedItem, setSelectedItem] = useState<InventarioItem | null>(null);
    const [filter, setFilter] = useState<"tutti" | "scadenza" | "soglia" | "terminati">("tutti");
    const [searchQuery, setSearchQuery] = useState("");
    const [daysToExpiration, setDaysToExpiration] = useState<number | "">(10);
    const [stockThreshold, setStockThreshold] = useState<number | "">(5);
    const [missingItem, setMissingItem] = useState<InventarioItem | null>(null);
    const [missingQuantity, setMissingQuantity] = useState<number>(1);

    // Funzione per calcolare al volo la quantità globale di un prodotto
    const getQuantitaGlobale = (item: InventarioItem) => {
        return item.lotti.reduce((acc, lotto) => acc + lotto.quantita, 0);
    };

    // Gestione Carico / Scarico veloce sul primo lotto disponibile
    const handleMovimentoRapido = (prodottoId: string, batchId: string, delta: number) => {
        setItems((prev) =>
            prev.map((item) => {
                if (item.id !== prodottoId) return item;

                const itemAggiornato = {
                    ...item,
                    lotti: item.lotti.map((lotto) =>
                        lotto.id === batchId
                            ? { ...lotto, quantita: Math.max(0, lotto.quantita + delta) }
                            : lotto
                    )
                };

                setSelectedItem(itemAggiornato);
                return itemAggiornato;
            })
        );
    };

    // NUOVA FUNZIONE: Gestione della modifica inline delle info del lotto
    const handleModificaLotto = (
        prodottoId: string,
        batchId: string,
        campiAggiornati: Partial<{ codiceLotto: string; scadenza: string; prezzo: number }>
    ) => {
        setItems((prev) =>
            prev.map((item) => {
                if (item.id !== prodottoId) return item;

                const itemAggiornato = {
                    ...item,
                    lotti: item.lotti.map((lotto) =>
                        lotto.id === batchId ? { ...lotto, ...campiAggiornati } : lotto
                    )
                };

                setSelectedItem(itemAggiornato);
                return itemAggiornato;
            })
        );
    };

    // NUOVA FUNZIONE: Aggiunta di un nuovo lotto vuoto modificabile
    const handleAggiungiLotto = (prodottoId: string) => {
        const nuovoLotto: Batch = {
            id: `b_${Date.now()}`, // ID univoco temporaneo
            codiceLotto: "NUOVO-LOTTO",
            scadenza: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // preimpostato a +1 anno
            quantita: 1,
            prezzo: 0.00
        };

        setItems((prev) =>
            prev.map((item) => {
                if (item.id !== prodottoId) return item;

                const itemAggiornato = {
                    ...item,
                    lotti: [...item.lotti, nuovoLotto]
                };

                setSelectedItem(itemAggiornato);
                return itemAggiornato;
            })
        );
    };

    const handleEliminaLotto = (prodottoId: string, batchId: string) => {
        setItems((prev) =>
            prev.map((item) => {
                if (item.id !== prodottoId) return item;

                const itemAggiornato = {
                    ...item,
                    lotti: item.lotti.filter((lotto) => lotto.id !== batchId)
                };

                // Aggiorna anche il dialog per mostrare subito la sparizione del lotto
                setSelectedItem(itemAggiornato);
                return itemAggiornato;
            })
        );
    };

    const filteredItems = items.filter((item) => {
        const matchesSearch = item.prodotto.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;
    
        const qtaGlobale = getQuantitaGlobale(item);
    
        // Se il filtro attivo è "terminati", mostra SOLO i prodotti con quantità 0
        if (filter === "terminati") {
            return qtaGlobale === 0;
        }
    
        // Per TUTTI gli altri filtri, se il prodotto è terminato va nascosto
        if (qtaGlobale === 0) {
            return false;
        }
    
        // Logica per il filtro Scadenza (esclude già i terminati grazie al controllo sopra)
        if (filter === "scadenza") {
            const oggi = new Date();
            return item.lotti.some((lotto) => {
                const dataScadenza = new Date(lotto.scadenza);
                const differenzaTempo = dataScadenza.getTime() - oggi.getTime();
                const diferenciaGiorni = Math.ceil(differenzaTempo / (1000 * 60 * 60 * 24));
    
                const giorniLimite = daysToExpiration === "" ? 10 : daysToExpiration;
                return diferenciaGiorni <= giorniLimite;
            });
        }
    
        // Logica per il filtro Soglia (mostrerà solo i prodotti tra 1 e la soglia limite)
        if (filter === "soglia") {
            const sogliaLimite = stockThreshold === "" ? 5 : stockThreshold;
            return qtaGlobale <= sogliaLimite; // qtaGlobale sarà sicuramente maggiore di 0 qui
        }
    
        return true;
    });

    return (
        <main className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans antialiased">
            <div className="max-w-3xl mx-auto pt-10 px-1">
                {/* Riga dei Filtri Orizzontale Scrollabile per Mobile */}
                <div className="my-2 px-1 flex items-center gap-2 w-full overflow-x-auto whitespace-nowrap scrollbar-none pb-2">
                    {/* 1. TUTTI + RICERCA */}
                    <div className={`flex items-center gap-1.5 rounded-xl transition-all ${filter === "tutti" ? "bg-zinc-100 dark:bg-zinc-900" : ""}`}>
                        <button
                            onClick={() => setFilter("tutti")}
                            className={`px-3 py-1 text-xs font-bold uppercase tracking-tight rounded-lg transition-all ${filter === "tutti"
                                ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                                : "text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                                }`}
                        >
                            Tutti ({items.length})
                        </button>

                        <AnimatePresence>
                            {filter === "tutti" && (
                                <motion.input
                                    initial={{ width: 0, opacity: 0 }}
                                    animate={{ width: 120, opacity: 1 }}
                                    exit={{ width: 0, opacity: 0 }}
                                    type="text"
                                    placeholder="Cerca..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    className="px-2 py-0.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-400 text-zinc-900 dark:text-zinc-100"
                                />
                            )}
                        </AnimatePresence>
                    </div>

                    {/* 4. TERMINATI */}
                    <div className={`flex items-center gap-1.5 rounded-xl transition-all ${filter === "terminati" ? "bg-zinc-100 dark:bg-zinc-900" : ""}`}>
                        <button
                            onClick={() => setFilter("terminati")}
                            className={`px-3 py-1 text-xs font-bold uppercase tracking-tight rounded-lg transition-all ${filter === "terminati"
                                ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                                : "text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                                }`}
                        >
                            ​💢 Terminati ({items.filter(item => getQuantitaGlobale(item) === 0).length})
                        </button>
                    </div>

                    {/* 2. IN SCADENZA + GIORNI */}
                    <div className={`flex items-center gap-1.5 rounded-xl transition-all ${filter === "scadenza" ? "bg-zinc-100 dark:bg-zinc-900" : ""}`}>
                        <button
                            onClick={() => setFilter("scadenza")}
                            className={`px-3 py-1 text-xs font-bold uppercase tracking-tight rounded-lg transition-all ${filter === "scadenza"
                                ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                                : "text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                                }`}
                        >
                            ⚠️ Scadenza
                        </button>

                        <AnimatePresence>
                            {filter === "scadenza" && (
                                <motion.div
                                    initial={{ width: 0, opacity: 0 }}
                                    animate={{ width: "auto", opacity: 1 }}
                                    exit={{ width: 0, opacity: 0 }}
                                    className="flex items-center gap-1 overflow-hidden"
                                >
                                    <span className="text-[10px] uppercase font-bold text-zinc-400">gg:</span>
                                    <input
                                        type="number"
                                        pattern="[0-9]*"
                                        inputMode="numeric"
                                        value={daysToExpiration}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setDaysToExpiration(val === "" ? "" : Math.max(0, parseInt(val)));
                                        }}
                                        className="w-10 px-1 py-0.5 text-center font-mono text-xs font-bold rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-zinc-400"
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* 3. SOTTO SOGLIA + QUANTITÀ */}
                    <div className={`flex items-center gap-1.5 rounded-xl transition-all ${filter === "soglia" ? "bg-zinc-100 dark:bg-zinc-900" : ""}`}>
                        <button
                            onClick={() => setFilter("soglia")}
                            className={`px-3 py-1 text-xs font-bold uppercase tracking-tight rounded-lg transition-all ${filter === "soglia"
                                ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                                : "text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                                }`}
                        >
                            📉 Soglia
                        </button>

                        <AnimatePresence>
                            {filter === "soglia" && (
                                <motion.div
                                    initial={{ width: 0, opacity: 0 }}
                                    animate={{ width: "auto", opacity: 1 }}
                                    exit={{ width: 0, opacity: 0 }}
                                    className="flex items-center gap-1 overflow-hidden"
                                >
                                    <span className="text-[10px] uppercase font-bold text-zinc-400">qtà ≤</span>
                                    <input
                                        type="number"
                                        pattern="[0-9]*"
                                        inputMode="numeric"
                                        value={stockThreshold}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setStockThreshold(val === "" ? "" : Math.max(0, parseInt(val)));
                                        }}
                                        className="w-10 px-1 py-0.5 text-center font-mono text-xs font-bold rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-zinc-400"
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>


                </div>

                {/* Lista dei Prodotti Inventario */}
                <div className="space-y-1 pb-24">
                    <AnimatePresence initial={false}>
                        {filteredItems.map((item) => {
                            const qtaGlobale = getQuantitaGlobale(item);

                            return (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.97 }}
                                    className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl shadow-sm overflow-hidden"
                                >
                                    {/* Riga Principale */}
                                    <div className="p-1 flex items-center justify-between gap-3 select-none">
                                        <div
                                            onClick={() => setSelectedItem(item)}
                                            className="flex-1 min-w-0 cursor-pointer"
                                        >
                                            <div className="flex justify-between">
                                                <h2 className="font-semibold text-sm tracking-tight text-zinc-900 dark:text-zinc-100">
                                                    {item.prodotto}
                                                </h2>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-base font-mono text-zinc-600 dark:text-zinc-400">
                                                    #{qtaGlobale}
                                                </span>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation(); // Evita che si apra anche il DettaglioProdottoDialog
                                                        setMissingItem(item);
                                                        setMissingQuantity(1); // Reset quantitativo di partenza
                                                    }}
                                                    className="bg-zinc-300 text-zinc-800 dark:text-zinc-400 dark:bg-zinc-800 rounded-lg px-2 py-1 text-sm hover:bg-zinc-400 dark:hover:bg-zinc-700 transition-colors"
                                                >
                                                    riordina
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            </div>

            {/* Dialog Fabbisogno Articolo Mancante */}
            <AnimatePresence>
                {missingItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-1">
                        {/* Sfondo Oscurato */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setMissingItem(null)}
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
                        />

                        {/* Contenitore Dialog */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 p-3 shadow-xl border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 z-10"
                        >
                            <h3 className="text-sm font-bold uppercase tracking-tight text-zinc-500 dark:text-zinc-400 mb-1">
                                Questo articolo manca: aggiungilo al RIORDINO
                            </h3>
                            <p className="text-base font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
                                {missingItem.prodotto}
                            </p>

                            {/* Input Quantità */}
                            <div className="flex items-center justify-between gap-4 mb-6">
                                <span className="text-sm font-medium">da aggiungere:</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setMissingQuantity(q => Math.max(1, q - 1))}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-bold"
                                    >
                                        -
                                    </button>
                                    <input
                                        type="number"
                                        pattern="[0-9]*"
                                        inputMode="numeric"
                                        value={missingQuantity}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            setMissingQuantity(isNaN(val) ? 1 : Math.max(1, val));
                                        }}
                                        className="w-12 py-1 text-center font-mono font-bold rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setMissingQuantity(q => q + 1)}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-bold"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            {/* Azioni */}
                            <div className="flex gap-2 justify-end text-xs font-bold uppercase tracking-tight">
                                <button
                                    onClick={() => setMissingItem(null)}
                                    className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-850 transition-all"
                                >
                                    Annulla
                                </button>
                                <button
                                    onClick={() => {
                                        // Qui in futuro metterai la logica di salvataggio
                                        alert(`Aggiunte ${missingQuantity} unità di "${missingItem.prodotto}" al fabbisogno`);
                                        setMissingItem(null);
                                    }}
                                    className="px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:opacity-90 transition-all"
                                >
                                    Conferma
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Dialog di Dettaglio */}
            <AnimatePresence>
                {selectedItem && (
                    <DettaglioProdottoDialog
                        item={selectedItem}
                        onClose={() => setSelectedItem(null)}
                        onMovimentoRapido={handleMovimentoRapido}
                        onAggiungiLotto={handleAggiungiLotto}
                        onModificaLotto={handleModificaLotto}
                        onEliminaLotto={handleEliminaLotto}
                    />
                )}
            </AnimatePresence>

            <AIBotWidget />
        </main>
    );
}