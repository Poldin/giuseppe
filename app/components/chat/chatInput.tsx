"use client";

import React, { useState, useEffect, useRef } from "react";
import { Send, Mic, Trash2 } from "lucide-react";

interface ChatInputProps {
    activeChat: string | null;
    // Modifichiamo il tipo per accettare sia testo semplice che un URL audio
    onSendMessage: (text: string, type?: "text" | "audio") => void;
    externalInput?: string;
    autoStartRecording?: boolean;
}

export default function ChatInput({ activeChat, onSendMessage, externalInput = "", autoStartRecording = false }: ChatInputProps) {
    const [text, setText] = useState("");
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);

    // Riferimenti per la gestione dell'audio nativo
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (autoStartRecording && activeChat && !isRecording) {
            startRecording();
        }
    }, [autoStartRecording, activeChat]);

    // Regola l'altezza della textarea dinamicamente
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            // Resetta l'altezza per calcolare correttamente il nuovo scrollHeight
            textarea.style.height = "auto";
            // Imposta l'altezza pari allo scrollHeight (fino al max-h impostato via CSS)
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }, [text]);

    // Sincronizza l'input dai suggerimenti esterni
    useEffect(() => {
        if (externalInput) {
            setText(externalInput);
        }
    }, [externalInput]);

    // Gestione del timer visivo
    useEffect(() => {
        if (isRecording) {
            timerRef.current = setInterval(() => {
                setRecordingTime((prev) => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
            setRecordingTime(0);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isRecording]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault(); // Evita il va a capo di default
            handleSubmit(e);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim() || !activeChat) return;

        onSendMessage(text, "text");
        setText("");
    };

    // AVVIA LA REGISTRAZIONE REALE
    const startRecording = async () => {
        if (!activeChat) return;
        try {
            // Richiede il permesso al browser per usare il microfono
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunksRef.current = [];

            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;

            // Accumula i dati audio man mano che vengono registrati
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            // Quando la registrazione si ferma, crea l'URL riproducibile
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
                const audioUrl = URL.createObjectURL(audioBlob);

                // Invia l'URL temporaneo al widget principale
                onSendMessage(audioUrl, "audio");

                // Stoppa tutte le tracce del microfono per spegnere la spia di registrazione del browser
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Errore nell'accesso al microfono:", err);
            alert("Impossibile accedere al microfono. Controlla i permessi del browser.");
        }
    };

    // FERMA E SALVA LA REGISTRAZIONE
    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    // ANNULLA SENZA SALVARE
    const cancelRecording = () => {
        if (mediaRecorderRef.current) {
            // Sovrascriviamo l'onstop temporaneamente per evitare che invii l'audio interrotto
            mediaRecorderRef.current.onstop = () => {
                if (mediaRecorderRef.current) {
                    const stream = mediaRecorderRef.current.stream;
                    stream.getTracks().forEach(track => track.stop());
                }
            };
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
    };

    return (
        <div className="shrink-0 p-1 bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-900">
            <div className="max-w-2xl mx-auto flex gap-1 items-center">

                {isRecording ? (
                    <div className="flex-1 flex items-center justify-between bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl px-4 py-2.5">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-600 dark:bg-red-500 animate-pulse" />
                            <span className="text-sm font-medium text-red-600 dark:text-red-400">
                                Rec {formatTime(recordingTime)}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={cancelRecording}
                            className="text-zinc-500 hover:text-red-600 p-1 rounded-lg transition-colors"
                            title="Elimina registrazione"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex-1 flex items-end">
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            placeholder={activeChat ? "Scrivi un messaggio..." : "Seleziona o crea una chat..."}
                            disabled={!activeChat}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-zinc-100 dark:bg-zinc-900 border border-transparent focus:border-zinc-300 dark:focus:border-zinc-700 focus:outline-none rounded-xl px-4 py-2.5 text-sm disabled:opacity-50 transition-all resize-none max-h-32 overflow-y-auto py-3 leading-relaxed block"
                        />
                    </form>
                )}

                {text.trim() ? (
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!activeChat}
                        className="p-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 rounded-xl hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center min-w-[42px] min-h-[42px]"
                    >
                        <Send size={18} />
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={!activeChat}
                        className={`p-2.5 rounded-xl hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center min-w-[42px] min-h-[42px] ${isRecording ? "bg-red-600 text-white dark:bg-red-500" : "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950"
                            }`}
                    >
                        {isRecording ? <Send size={18} /> : <Mic size={18} />}
                    </button>
                )}
            </div>
        </div>
    );
}