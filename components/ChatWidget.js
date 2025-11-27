"use client";

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { useState, useRef, useEffect } from "react";

const MODEL_NAME = "gemini-2.5-flash"; 
const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "model", parts: [{ text: "Hello! How can I help?" }] },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef(null);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  async function runChat(promptText) {
    const newHistory = [...messages, { role: "user", parts: [{ text: promptText }] }];
    setMessages(newHistory);
    setInput("");
    setIsLoading(true);

    const genAI = new GoogleGenerativeAI(API_KEY);
    
    const model = genAI.getGenerativeModel({ 
        model: MODEL_NAME,
        systemInstruction: {
            parts: [{ text: "You are a helpful AI assistant. You are a text-based model. You CANNOT generate images, videos, or audio files. If a user asks for an image, politely explain that you can only provide text descriptions or code, but not actual visual files." }],
            role: "system"
        }
    });

    const generationConfig = {
      temperature: 0.9,
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048,
    };

    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ];

    const apiHistory = newHistory.filter((msg, index) => {
        return index > 0 || msg.role === "user";
    });

    const chat = model.startChat({
      generationConfig,
      safetySettings,
      history: apiHistory, 
    });

    try {
      const result = await chat.sendMessage(promptText);
      const response = result.response;
      
      setMessages((prev) => [
        ...prev,
        { role: "model", parts: [{ text: response.text() }] },
      ]);
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsLoading(false);
    }
  }

  const onSubmit = (event) => {
    event.preventDefault();
    if (!input.trim()) return;
    runChat(input);
  };

  return (
    <>
      <style jsx>{`
        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-slide-up { animation: slideInUp 0.3s ease-out forwards; }
        .animate-pop-in { animation: fadeIn 0.2s ease-out forwards; }
      `}</style>

      {/* --- Toggle Button (Compact & Responsive) --- */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-4 right-4 h-12 w-auto px-6 bg-black text-white rounded-full shadow-xl flex items-center justify-center transition-all duration-300 z-60 hover:scale-105 active:scale-95 cursor-pointer ${
            isOpen ? "bg-gray-800" : ""
        }`}
      >
        <span className="font-semibold text-sm tracking-wide">
            {isOpen ? "X" : "Chat With AI"}
        </span>
      </button>

      {/* --- Chat Window --- */}
      {isOpen && (
        <div 
            // UPDATED HERE: Changed h-[60vh] to h-[75vh] for mobile. 
            // sm:h-[450px] remains unchanged for desktop.
            className="fixed bottom-20 right-4 left-4 sm:left-auto sm:w-[320px] h-[35vh] sm:h-[450px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden z-50 animate-slide-up"
        >
          
          {/* Header */}
          <div className="bg-black p-3 text-white flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <h2 className="font-semibold text-xs tracking-wide">EaseRent AI</h2>
            </div>
            <button onClick={() => setIsOpen(false)} className="opacity-70 hover:opacity-100 transition-opacity">
               
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50 scrollbar-thin scrollbar-thumb-gray-200">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex animate-pop-in ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] p-2.5 rounded-lg text-sm shadow-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-black text-white rounded-br-none"
                      : "bg-white border border-gray-200 text-gray-800 rounded-bl-none"
                  }`}
                >
                  <div dangerouslySetInnerHTML={{ __html: msg.parts[0].text }} />
                </div>
              </div>
            ))}
            
            {/* Loading Dots */}
            {isLoading && (
               <div className="flex justify-start animate-pop-in">
                  <div className="bg-white border border-gray-200 rounded-lg rounded-bl-none p-2.5 shadow-sm flex items-center gap-1">
                    <span className="w-1 h-1 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1 h-1 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1 h-1 bg-gray-500 rounded-full animate-bounce"></span>
                  </div>
               </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={onSubmit} className="p-2 bg-white border-t border-gray-100 flex gap-2">
            <input
              type="text"
              name="prompt"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type..."
              className="flex-1 bg-gray-100 rounded-md px-3 py-2 text-xs text-black focus:outline-none focus:ring-1 focus:ring-black focus:bg-white transition-colors"
            />
            <button
              type="submit"
              disabled={isLoading}
              className={`p-2 rounded-md text-white transition-all ${
                  input.trim() 
                  ? "bg-black hover:bg-gray-800" 
                  : "bg-gray-300 cursor-not-allowed"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}