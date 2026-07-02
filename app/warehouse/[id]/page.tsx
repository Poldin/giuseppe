"use client";

import { useState, useRef, use } from "react";
import { Menu } from "lucide-react";
import InventarioContent from "@/app/components/warehouse/inventory";
import FabbisognoContent from "@/app/components/warehouse/fabbisogno";


interface PageProps {
    params: Promise<{ id: string }> | { id: string };
}

export default function WarehousePage({ params }: PageProps) {
    const resolvedParams = 'then' in params ? use(params) : params;
    const warehouseId = resolvedParams.id;
    const [activeTab, setActiveTab] = useState<"fabbisogno" | "inventario">("fabbisogno");
    const fabbisognoRef = useRef<HTMLButtonElement>(null);
    const inventarioRef = useRef<HTMLButtonElement>(null);

    const handleTabClick = (tab: "fabbisogno" | "inventario") => {
        setActiveTab(tab);

        // Esegue lo scroll sul tab selezionato portandolo al centro o all'inizio
        const ref = tab === "fabbisogno" ? fabbisognoRef : inventarioRef;
        ref.current?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center"
        });
    };

    return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">

            {/* 1. HEADER UNICO FISSO IN ALTO (H-12) */}
            <header className="w-full fixed top-0 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md z-50 border-b border-zinc-100 dark:border-zinc-900 h-fit min-h-8 flex items-center">
                <div className="max-w-7xl mx-auto px-2 w-full flex items-center gap-2 h-full">

                    {/* Bottone Hamburger - Resta fisso a sinistra */}
                    <button className="shrink-0 p-1 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
                        <Menu size={20} />
                    </button>

                    {/* BARRA DEI TAB SCROLLABILE - Sulla stessa riga dell'hamburger */}
                    <div
                        className="flex-1 flex items-center gap-6 overflow-x-auto overflow-y-hidden select-none h-full min-w-0"
                        style={{
                            scrollbarWidth: 'none',
                            msOverflowStyle: 'none',
                        }}
                    >
                        {/* Stile CSS per nascondere la scrollbar su Chrome/Safari */}
                        <style jsx global>{`
                            .hide-scrollbar::-webkit-scrollbar { display: none; }
                        `}</style>

                        <div className="flex items-center gap-6 shrink-0 pr-4 hide-scrollbar overflow-x-auto overflow-y-hidden w-full h-full">

                            {/* Tab Fabbisogno */}
                            <button
                                ref={fabbisognoRef}
                                onClick={() => handleTabClick("fabbisogno")}
                                className={`font-black text-xl tracking-tighter uppercase leading-none transition-colors shrink-0 whitespace-nowrap outline-none ${activeTab === "fabbisogno"
                                    ? "text-zinc-900 dark:text-zinc-100"
                                    : "text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400"
                                    }`}
                            >
                                🪙RIORDINO
                            </button>

                            {/* Tab Inventario */}
                            {/* <button
                                ref={inventarioRef}
                                onClick={() => handleTabClick("inventario")}
                                className={`font-black text-xl tracking-tighter uppercase leading-none transition-colors shrink-0 whitespace-nowrap outline-none ${activeTab === "inventario"
                                    ? "text-zinc-900 dark:text-zinc-100"
                                    : "text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400"
                                    }`}
                            >
                                ​🗃️MAGAZZINO
                            </button> */}
                        </div>
                    </div>
                </div>
            </header>

            {/* 3. CONTENUTO DELLA PAGINA */}
            <main className="max-w-7xl mx-auto px-1 pt-1 pb-8">
                {activeTab === "fabbisogno" && <FabbisognoContent warehouseId={warehouseId} />}
                {activeTab === "inventario" && <InventarioContent />}
            </main>

        </div>
    );
}