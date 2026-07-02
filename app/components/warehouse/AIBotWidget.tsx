"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageSquare, Plus, History, Send, Sparkles, BookOpenText, Mic } from "lucide-react";
import Image from "next/image";
import ChatInput from "../chat/chatInput";

interface Chat {
    id: string;
    title: string;
    date: string;
}

interface Message {
    id: string;
    chatId: string;
    text: string;
    sender: "user" | "bot";
    type?: "text" | "audio";
}

type TabType = "chat" | "history" | "instructions";

export default function AIBotWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [chats, setChats] = useState<Chat[]>([
        { id: "1", title: "Verifica scorte guanti in nitrile", date: "Oggi" },
        { id: "2", title: "Ordine urgente compositi poltrona 2", date: "Ieri" },
    ]);

    // Messaggi finti di partenza per popolare la UI delle vecchie chat
    const [messages, setMessages] = useState<Message[]>([
        { id: "m1", chatId: "1", text: "Ciao Giuseppe, puoi verificare i guanti?", sender: "user" },
        { id: "m2", chatId: "1", text: "Controllo subito nei sistemi delle scorte.", sender: "bot" },
    ]);

    const [activeChat, setActiveChat] = useState<string | null>(null);
    const [input, setInput] = useState("");
    const [activeTab, setActiveTab] = useState<TabType>("chat");
    const [shouldRecord, setShouldRecord] = useState(false);

    const SUGGESTIONS = [
        "mi dai il riepilogo del FABBISOGNO? 🥹",
        "mi fai una sintesi del MAGAZZINO?",
        "🕯️aiuto: cosa posso chiederti?"
    ];

    const handleSuggestionClick = (suggestion: string) => {
        setInput(suggestion);
    };



    const handleNewChat = () => {
        const newId = String(Date.now());
        setActiveChat(newId);
        setActiveTab("chat");
        setShouldRecord(false);
    };

    const handleSelectChat = (chatId: string) => {
        setActiveChat(chatId);
        setActiveTab("chat");
        setShouldRecord(false);
    };

    const handleSendMessageText = (textToSend: string, type: "text" | "audio" = "text") => {
        if (!activeChat) return;
        setShouldRecord(false);

        // Controlliamo se questa chat è già presente nell'elenco a sinistra
        const chatExists = chats.some(c => c.id === activeChat);

        if (!chatExists) {
            // Se la chat NON esiste ancora, la creiamo ORA (al primo messaggio vero)
            const defaultTitle = type === "audio" ? "Nota vocale" : textToSend;
            const truncatedTitle = defaultTitle.length > 30 ? defaultTitle.substring(0, 30) + "..." : defaultTitle;

            const newChat: Chat = {
                id: activeChat,
                title: truncatedTitle,
                date: "Adesso",
            };

            setChats((prevChats) => [newChat, ...prevChats]);
        } else {
            // Se esisteva già (es. vecchie chat), aggiorna il titolo solo se era un placeholder
            setChats((prevChats) =>
                prevChats.map((chat) => {
                    if (chat.id === activeChat && chat.title === "Nuova chat...") {
                        const defaultTitle = type === "audio" ? "Nota vocale" : textToSend;
                        const truncatedTitle = defaultTitle.length > 30 ? defaultTitle.substring(0, 30) + "..." : defaultTitle;
                        return { ...chat, title: truncatedTitle };
                    }
                    return chat;
                })
            );
        }

        const userMessage: Message = {
            id: String(Date.now()),
            chatId: activeChat,
            text: textToSend,
            sender: "user",
            type: type
        };

        setMessages((prev) => [...prev, userMessage]);

        // Risposta finta del bot
        setTimeout(() => {
            const botMessage: Message = {
                id: String(Date.now() + 1),
                chatId: activeChat,
                text: type === "audio" ? "Ho ascoltato la tua nota vocale. Come posso procedere?" : "Ho ricevuto il tuo messaggio. Come posso aiutarti con questa pratica?",
                sender: "bot",
                type: "text"
            };
            setMessages((prev) => [...prev, botMessage]);
        }, 1000);
    };

    // Filtra i messaggi appartenenti SOLO alla chat attualmente attiva
    const currentChatMessages = messages.filter(m => m.chatId === activeChat);

    return (
        <>

            {!isOpen && (
                <button
                    onClick={() => {
                        setIsOpen(true);
                        setActiveTab("chat");
                        setActiveChat(String(Date.now()));
                        setShouldRecord(true); 
                    }}
                    className="fixed bottom-1 right-1 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-red-600 text-white shadow-xl hover:scale-105 active:scale-95 transition-all"
                    title="Parla ora"
                >
                    <Mic size={22} />
                </button>
            )}

            {/* Tasto Tondo Floating */}
            <button
                onClick={() => {
                    // 1. Apri il dialog
                    setIsOpen(true);
                    // 2. Forza l'apertura sulla tab della chat
                    setActiveTab("chat");
                    // 3. Genera l'ID temporaneo senza sporcare lo stato 'chats'
                    setActiveChat(String(Date.now()));
                }}
                className="fixed bottom-1 right-16 z-40 group flex items-center justify-center w-14 h-14 rounded-full bg-zinc-900 dark:bg-zinc-100 shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
                <div className="relative w-full h-full rounded-full overflow-hidden p-0.5">
                    <Image
                        src="/giuseppe.jpeg"
                        alt="AI Bot Giuseppe"
                        fill
                        className="object-cover rounded-full"
                        priority
                    />
                    <div className="absolute -top-1 -right-1 bg-zinc-500 text-white p-1 rounded-full shadow-md scale-75">
                        <Sparkles size={12} className="fill-white" />
                    </div>
                </div>
            </button>

            {/* Dialog a Pagina Intera */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="fixed inset-0 h-screen max-h-screen w-screen bg-white dark:bg-zinc-950 z-50 flex flex-col md:flex-row font-sans text-zinc-900 dark:text-zinc-100 overflow-hidden"
                    >
                        {/* --- BARRA SUPERIORE / NAVIGATION --- */}
                        <div className="w-full md:w-80 bg-zinc-50 dark:bg-zinc-900/50 p-1 flex flex-col shrink-0">

                            {/* Header */}
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0">
                                        <Image src="/giuseppe.jpeg" alt="Giuseppe" fill className="object-cover rounded-full" />
                                    </div>
                                    <div>
                                        <h1 className="font-bold text-2xl leading-none">Giuseppe</h1>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Menu di Navigazione Tab */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setActiveTab(activeTab === "history" ? "chat" : "history")}
                                    className={`p-2.5 rounded-xl transition-colors ${activeTab === "history"
                                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                                        : "bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400"
                                        }`}
                                    title="Cronologia Chat"
                                >
                                    <History size={18} />
                                </button>

                                <button
                                    onClick={handleNewChat}
                                    className={`p-2.5 rounded-xl transition-colors ${activeTab === "chat"
                                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                                        : "bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400"
                                        }`}
                                >
                                    <Plus size={18} />
                                </button>
                            </div>

                            {/* Sidebar Desktop */}
                            <div className="hidden md:block flex-1 overflow-y-auto space-y-1 pr-1">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2 px-2">I tuoi messaggi</p>
                                {chats.map((chat) => (
                                    <button
                                        key={chat.id}
                                        onClick={() => handleSelectChat(chat.id)}
                                        className={`w-full text-left p-2 rounded-xl flex items-start gap-3 transition-colors text-sm ${activeChat === chat.id
                                            ? "bg-zinc-200 dark:bg-zinc-800 font-medium"
                                            : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400"
                                            }`}
                                    >
                                        <History size={16} className="mt-0.5 shrink-0 text-zinc-400" />
                                        <div className="min-w-0">
                                            <p className="truncate text-xs">{chat.title}</p>
                                            <span className="text-[10px] text-zinc-400">{chat.date}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* --- AREA PRINCIPALE (Dinamica) --- */}
                        <div className="flex-1 flex flex-col min-w-0 h-full bg-white dark:bg-zinc-950 overflow-hidden">

                            {/* VISTA CRONOLOGIA (Solo Mobile) */}
                            {activeTab === "history" && (
                                <div className="flex-1 overflow-y-auto p-4 space-y-2 md:hidden">
                                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4">Cronologia Chat</p>
                                    {chats.map((chat) => (
                                        <button
                                            key={chat.id}
                                            onClick={() => handleSelectChat(chat.id)}
                                            className={`w-full text-left p-1 border border-zinc-100 dark:border-zinc-900 rounded-xl flex items-start gap-3 transition-colors text-sm ${activeChat === chat.id ? "bg-zinc-100 dark:bg-zinc-800" : ""
                                                }`}
                                        >
                                            <History size={16} className="mt-0.5 shrink-0 text-zinc-500" />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">{chat.title}</p>
                                                <span className="text-xs text-zinc-400">{chat.date}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* VISTA CHAT REALE */}
                            <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${activeTab === "chat" ? "flex" : "hidden md:flex"}`}>

                                {/* Corpo Messaggi Dinamico */}
                                <div className="flex-1 overflow-y-auto p-1 space-y-4 bg-zinc-50/30 dark:bg-zinc-950">
                                    {!activeChat ? (
                                        <div className="h-full flex flex-col items-center justify-center text-center p-6 max-w-sm mx-auto">
                                            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-400 mb-3">
                                                <MessageSquare size={24} />
                                            </div>
                                            <p className="text-xs text-zinc-400">Inizia una nuova chat o selezionane una precedente.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 max-w-2xl mx-auto w-full pt-2 flex-1 flex flex-col">
                                            {/* Se non ci sono messaggi, mostra i suggerimenti al centro */}
                                            {currentChatMessages.length === 0 ? (
                                                <div className="flex-1 flex flex-col items-center justify-center p-2">
                                                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
                                                        Suggerimenti
                                                    </p>
                                                    <div className="grid grid-cols-1 gap-2 w-full max-w-md">
                                                        {SUGGESTIONS.map((suggestion, index) => (
                                                            <button
                                                                key={index}
                                                                type="button"
                                                                onClick={() => handleSuggestionClick(suggestion)}
                                                                className="text-left text-sm p-3.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/50 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all active:scale-[0.99] text-zinc-700 dark:text-zinc-300 shadow-sm"
                                                            >
                                                                {suggestion}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Se ci sono messaggi, mostra la lista classica */
                                                currentChatMessages.map((msg) => (
                                                    <div
                                                        key={msg.id}
                                                        className={`max-w-[80%] rounded-xl p-2 whitespace-pre-wrap text-md ${msg.sender === "user"
                                                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 self-end rounded-tr-none"
                                                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 self-start rounded-tl-none"
                                                            }`}
                                                    >
                                                        {msg.type === "audio" ? (
                                                            /* Se il messaggio è di tipo audio, renderizza il player HTML nativo */
                                                            <audio src={msg.text} controls className="max-w-full rounded-lg h-10 outline-none style-audio-player" />
                                                        ) : (
                                                            /* Altrimenti mostra il testo standard */
                                                            msg.text
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Input Form */}
                                <ChatInput
                                    activeChat={activeChat}
                                    onSendMessage={handleSendMessageText}
                                    externalInput={input}
                                    autoStartRecording={shouldRecord}
                                />
                            </div>

                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}