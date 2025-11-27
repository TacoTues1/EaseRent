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
  const [isAnimating, setIsAnimating] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef(null);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);
  
  const toggleChat = () => {
    if (isAnimating) return;
    
    if (!isOpen) {
      // Opening the chat
      setIsOpen(true);
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);
    } else {
      // Closing the chat - start animation first, then update state
      setIsAnimating(true);
      setTimeout(() => {
        setIsOpen(false);
        setIsAnimating(false);
      }, 250); // Slightly less than animation duration
    }
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

      // Format chat history for the API - ensure it's in the correct format
      const chatHistory = messages
        .filter(msg => msg.parts && msg.parts.length > 0)
        .map(msg => {
          // Ensure each part has the correct structure
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

      // For debugging - log the history being sent
      // console.log('Sending chat history:', JSON.stringify(chatHistory, null, 2));

      // Start a new chat with the formatted history
      const chat = model.startChat({
        history: chatHistory,
        generationConfig: {
          maxOutputTokens: 1000,
        },
      });

      // Send the message and get the response
      const result = await chat.sendMessage(promptText);
      const response = await result.response;
      
      // Handle the response
      let responseText = "";
      if (typeof response.text === 'function') {
        responseText = response.text();
      } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
        responseText = response.candidates[0].content.parts[0].text;
      } else if (typeof response.text === 'string') {
        responseText = response.text;
      } else {
        console.error('Unexpected response format:', response);
        throw new Error('Unexpected response format from the API');
      }

      // Add the AI's response to the messages
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
      <style jsx>{`
        @keyframes slideInUp {
          from { 
            opacity: 0; 
            transform: translateY(20px);
            visibility: hidden;
          }
          to { 
            opacity: 1; 
            transform: translateY(0);
            visibility: visible;
          }
        }
        @keyframes slideOutDown {
          from { 
            opacity: 1; 
            transform: translateY(0);
            visibility: visible;
          }
          to { 
            opacity: 0; 
            transform: translateY(20px);
            visibility: hidden;
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .chat-window {
          animation: ${isOpen ? 'slideInUp' : 'slideOutDown'} 0.3s ease-out forwards;
          ${!isOpen && 'pointer-events: none;'}
        }
        .animate-pop-in { 
          animation: fadeIn 0.2s ease-out forwards; 
        }
      `}</style>

      {/* --- Toggle Button (Compact & Responsive) --- */}
      <button
        onClick={toggleChat}
        className={`fixed bottom-4 right-4 h-12 w-12 sm:w-auto px-4 sm:px-6 bg-black text-white rounded-full shadow-xl flex items-center justify-center transition-all duration-300 z-60 hover:scale-105 active:scale-95 cursor-pointer ${
            isOpen ? "bg-gray-800" : ""
        }`}
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        <span className="font-semibold text-sm tracking-wide">
          {isOpen ? (
            <span className="text-lg">×</span>
          ) : (
            <span className="hidden sm:inline">Chat With AI</span>
          )}
        </span>
      </button>

      {/* --- Chat Window --- */}
      {(isOpen || isAnimating) && (
        <div 
            // UPDATED HERE: Changed h-[60vh] to h-[75vh] for mobile. 
            // sm:h-[450px] remains unchanged for desktop.
            className={`fixed bottom-20 right-4 left-4 sm:left-auto sm:w-[320px] h-[35vh] sm:h-[450px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden z-50 chat-window ${!isOpen ? 'opacity-0' : ''}`}
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