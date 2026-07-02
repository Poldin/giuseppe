"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Barcode, Calendar, DollarSign, MoveDownLeft, MoveUpRight, X, Plus, Trash2 } from "lucide-react";
import { InventarioItem } from "./inventory";
import { div, span } from "framer-motion/client";

interface DettaglioProdottoDialogProps {
    item: InventarioItem | null;
    onClose: () => void;
    onMovimentoRapido: (prodottoId: string, batchId: string, delta: number) => void;
    onAggiungiLotto?: (prodottoId: string) => void;
    onModificaLotto?: (prodottoId: string, batchId: string, campiAggiornati: Partial<{ codiceLotto: string; scadenza: string; prezzo: number }>) => void;
    onEliminaLotto: (prodottoId: string, batchId: string) => void;
}

export default function DettaglioProdottoDialog({
    item,
    onClose,
    onMovimentoRapido,
    onAggiungiLotto,
    onModificaLotto,
    onEliminaLotto,
}: DettaglioProdottoDialogProps) {
    if (!item) return null;

    const [activeTab, setActiveTab] = useState<"tutti" | "terminati" | "movimenti">("tutti");
    const [editingField, setEditingField] = useState<{ lottoId: string; field: string } | null>(null);

    // Calcolo al volo della quantità globale nel dialog
    const qtaGlobale = item.lotti.reduce((acc, lotto) => acc + lotto.quantita, 0);

    // Filtraggio dei lotti in base alla tab attiva
    const lottiFiltrati = item.lotti.filter((lotto) => {
        if (activeTab === "tutti") return lotto.quantita > 0;
        if (activeTab === "terminati") return lotto.quantita === 0;
        return true;
    });

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 flex flex-col justify-between"
        >
            {/* Header del Dialog */}
            <div className="p-2 max-w-3xl w-full mx-auto flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                        {item.prodotto} <span className={`text-md font-ligth text-zinc-800 dark:text-zinc-200`}>
                        · # {qtaGlobale}
                        </span>
                    </h2>

                </div>

                {/* Tasto chiusura veloce in alto a destra */}
                <button
                    onClick={onClose}
                    className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Contenuto Centrale: Lista Lotti */}
            <div className="flex-1 overflow-y-auto px-2 py-2 max-w-3xl w-full mx-auto space-y-2 pb-10">
                {/* Tab di filtraggio scrollabili orizzontalmente */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none [-webkit-overflow-scrolling:touch]">
                    <button
                        onClick={() => setActiveTab("tutti")}
                        className={`px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-full transition-colors whitespace-nowrap ${activeTab === "tutti"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500"
                            }`}
                    >
                        lotti ({item.lotti.filter(l => l.quantita > 0).length})
                    </button>
                    <button
                        onClick={() => setActiveTab("terminati")}
                        className={`px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-full transition-colors whitespace-nowrap ${activeTab === "terminati"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500"
                            }`}
                    >
                        💢Terminati ({item.lotti.filter(l => l.quantita === 0).length})
                    </button>
                    <button
                        onClick={() => setActiveTab("movimenti")}
                        className={`px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-full transition-colors whitespace-nowrap ${activeTab === "movimenti"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500"
                            }`}
                    >
                        ♾️Movimenti
                    </button>
                </div>

                <div className="space-y-2">
                    {activeTab === "movimenti" ? (
                        <div className="text-center py-8 text-sm text-zinc-400 dark:text-zinc-500 italic">
                            Nessun movimento registrato
                        </div>
                    ) : lottiFiltrati.length === 0 ? (
                        <div className="text-center py-8 text-sm text-zinc-400 dark:text-zinc-500 italic">
                            Nessun lotto in questa categoria
                        </div>
                    ) : (
                        lottiFiltrati.map((lotto) => {
                            const valoreTotale = (lotto.prezzo || 0) * lotto.quantita;

                            return (
                                <div
                                    key={lotto.id}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between p-1 rounded-xl border border-zinc-100 dark:border-zinc-950 bg-zinc-50/50 dark:bg-zinc-900/40 gap-3"
                                >
                                    {/* Dettagli Lotto */}
                                    <div className="text-sm space-y-0.5">
                                        {/* Modifica Codice Lotto */}
                                        {editingField?.lottoId === lotto.id && editingField?.field === "codice" ? (
                                            <input
                                                type="text"
                                                defaultValue={lotto.codiceLotto}
                                                autoFocus
                                                onBlur={(e) => {
                                                    if (onModificaLotto) onModificaLotto(item.id, lotto.id, { codiceLotto: e.target.value });
                                                    setEditingField(null);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") e.currentTarget.blur();
                                                }}
                                                className="font-mono font-medium bg-transparent border-b border-zinc-400 focus:outline-none text-zinc-900 dark:text-zinc-100"
                                            />
                                        ) : (
                                            <div className="flex items-center justify-between">
                                                <span
                                                    onClick={() => setEditingField({ lottoId: lotto.id, field: "codice" })}
                                                    className="font-mono font-medium cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 px-1 rounded transition-colors"
                                                >
                                                    {lotto.codiceLotto || "Senza Codice"}
                                                </span>
                                                <button
                                                    onClick={() => {
                                                        if (confirm("Vuoi davvero eliminare questo lotto?")) {
                                                            onEliminaLotto(item.id, lotto.id);
                                                        }
                                                    }}
                                                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-transparent hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-500 transition-colors mr-1"
                                                    title="Elimina lotto"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )}

                                        {/* Modifica Scadenza */}
                                        <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                                            <span>🗓️ scade</span>
                                            {editingField?.lottoId === lotto.id && editingField?.field === "scadenza" ? (
                                                <input
                                                    type="text"
                                                    defaultValue={lotto.scadenza}
                                                    autoFocus
                                                    onBlur={(e) => {
                                                        if (onModificaLotto) onModificaLotto(item.id, lotto.id, { scadenza: e.target.value });
                                                        setEditingField(null);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") e.currentTarget.blur();
                                                    }}
                                                    className="font-mono bg-transparent border-b border-zinc-400 focus:outline-none text-zinc-900 dark:text-zinc-100"
                                                />
                                            ) : (
                                                <span
                                                    onClick={() => setEditingField({ lottoId: lotto.id, field: "scadenza" })}
                                                    className="font-mono cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 px-1 rounded transition-colors"
                                                >
                                                    {lotto.scadenza || "Aggiungi data"}
                                                </span>
                                            )}
                                        </div>

                                        {/* Modifica Prezzo e Calcolo Totale */}
                                        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 col-span-2 sm:col-span-1 text-xs">
                                            <div className="flex items-center gap-0.5">
                                                <span>💶</span>
                                                {editingField?.lottoId === lotto.id && editingField?.field === "prezzo" ? (
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        defaultValue={lotto.prezzo || 0}
                                                        autoFocus
                                                        onBlur={(e) => {
                                                            if (onModificaLotto) onModificaLotto(item.id, lotto.id, { prezzo: parseFloat(e.target.value) || 0 });
                                                            setEditingField(null);
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") e.currentTarget.blur();
                                                        }}
                                                        className="font-mono w-16 bg-transparent border-b border-zinc-400 focus:outline-none text-zinc-900 dark:text-zinc-100"
                                                    />
                                                ) : (
                                                    <span
                                                        onClick={() => setEditingField({ lottoId: lotto.id, field: "prezzo" })}
                                                        className="font-mono cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 px-1 rounded transition-colors"
                                                    >
                                                        {lotto.prezzo ? lotto.prezzo.toFixed(2) : "0.00"}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-zinc-300 dark:text-zinc-700">|</span>
                                            <span className="font-mono text-zinc-700 dark:text-zinc-300 font-semibold">
                                                tot {valoreTotale.toFixed(2)} €
                                            </span>
                                        </div>
                                    </div>


                                    {/* Controlli Quantità */}
                                    <div className="flex items-center justify-end gap-1 self-end sm:self-auto">
                                        <button
                                            onClick={() => onMovimentoRapido(item.id, lotto.id, -1)}
                                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-red-600 dark:text-red-400 font-bold text-base transition-colors select-none"
                                        >
                                            <MoveDownLeft size={16} />
                                        </button>
                                        <span className="w-10 text-center font-mono text-base font-bold text-zinc-900 dark:text-zinc-100">
                                            {lotto.quantita}
                                        </span>
                                        <button
                                            onClick={() => onMovimentoRapido(item.id, lotto.id, 1)}
                                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-200 text-green-600 dark:text-green-400 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-bold text-base transition-colors select-none"
                                        >
                                            <MoveUpRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {/* Tasto Inserimento Lotto (visibile sotto i lotti attivi) */}
                    {activeTab === "tutti" && (
                        <button
                            onClick={() => onAggiungiLotto && onAggiungiLotto(item.id)}
                            className="w-full py-2.5 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors mt-4"
                        >
                            <Plus size={14} />
                            nuovo lotto
                        </button>
                    )}
                </div>
            </div>

            {/* Footer con tasto Indietro (In basso al centro, p-2 dal bottom) */}
            <div className="p-4 flex justify-center pb-2">
                <button
                    onClick={onClose}
                    className="fixed bottom-2 border border-zinc-700 left-1/2 -translate-x-1/2 w-fit z-50 bg-black text-white px-6 py-2 rounded-full shadow-lg"
                >
                    indietro
                </button>
            </div>
        </motion.div>
    );
}