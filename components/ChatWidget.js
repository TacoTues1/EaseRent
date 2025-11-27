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
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef(null);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);
  
  const openChat = (e) => {
    if (e) e.stopPropagation();
    setIsOpen(true);
  };

  const closeChat = () => {
    setIsOpen(false);
  };

  async function runChat(promptText) {
    const userMessage = { role: "user", parts: [{ text: promptText }] };
    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setInput("");
    setIsLoading(true);

    try {
      const genAI = new GoogleGenerativeAI(API_KEY);
      const model = genAI.getGenerativeModel({ model: MODEL_NAME });

      const chatHistory = messages
        .filter(msg => msg.parts && msg.parts.length > 0)
        .map(msg => {
          const parts = msg.parts.map(part => {
            if (typeof part === 'string') {
              return { text: part };
            }
            return part;
          });
          return {
            role: msg.role,
            parts: parts
          };
        });

      const chat = model.startChat({
        history: chatHistory,
        generationConfig: {
          maxOutputTokens: 1000,
        },
      });

      const result = await chat.sendMessage(promptText);
      const response = await result.response;
      
      let responseText = "";
      if (typeof response.text === 'function') {
        responseText = response.text();
      } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
        responseText = response.candidates[0].content.parts[0].text;
      } else if (typeof response.text === 'string') {
        responseText = response.text;
      } else {
        throw new Error('Unexpected response format');
      }

      setMessages(prev => [...prev, { 
        role: 'model', 
        parts: [{ text: responseText }] 
      }]);
    } catch (error) {
      console.error('Error in runChat:', error);
      const errorMessage = error.message.includes('API key not valid')
        ? 'API key is not valid. Please check your configuration.'
        : 'Sorry, something went wrong. Please try again.';
      setMessages(prev => [...prev, { 
        role: 'model', 
        parts: [{ text: errorMessage }] 
      }]);
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
      {/* --- Toggle Button (Only shows when chat is closed) --- */}
      {!isOpen && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50">
          <button 
            onClick={openChat}
            className="bg-black rounded-full p-3.5 flex items-center justify-center shadow-xl hover:scale-105 transition-transform"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </button>
        </div>
      )}

      {/* --- Chat Window --- */}
      {isOpen && (
        <div 
          onClick={(e) => e.stopPropagation()}
          className="fixed bottom-20 right-4 left-4 sm:left-auto sm:w-[320px] h-[35vh] sm:h-[450px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden z-50"
        >
          {/* Header */}
          <div className="bg-black p-3 text-white flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <h2 className="font-semibold text-xs tracking-wide">EaseRent AI</h2>
            </div>
            
            {/* Close Button */}
            {/* I added the 'X' icon and used toggleChat so the close animation plays smoothly */}
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeChat();
              }} 
              className="opacity-70 hover:opacity-100 transition-opacity p-1"
            >
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                 <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
               </svg>
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