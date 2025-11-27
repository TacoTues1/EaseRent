import { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Link from 'next/link';

const MODEL_NAME = "gemini-2.5-flash"; 
const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

export default function AIChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const router = useRouter();
  const [session, setSession] = useState(null);

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push('/');
      } else {
        setSession(data.session);
      }
    };
    getSession();
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function runChat(promptText) {
    const userMessage = { role: "user", parts: [{ text: promptText }] };
    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setInput("");
    setIsLoading(true);

    try {
      const genAI = new GoogleGenerativeAI(API_KEY);
      const model = genAI.getGenerativeModel({ model: MODEL_NAME });

      const chat = model.startChat({
        history: messages
          .filter(msg => msg.parts && msg.parts.length > 0)
          .map(msg => ({
            role: msg.role,
            parts: msg.parts.map(part => ({
              text: typeof part === 'string' ? part : part.text
            }))
          })),
        generationConfig: {
          maxOutputTokens: 1000,
        },
      });

      const result = await chat.sendMessage(promptText);
      const response = await result.response;
      const responseText = response.text();

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

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to access AI Chat</h1>
          <Link href="/" className="text-blue-600 hover:underline">Go to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-black p-4 text-white">
            <h1 className="text-xl font-bold">EaseRent AI Assistant</h1>
            <p className="text-sm opacity-80">Ask me anything about properties, rentals, or maintenance</p>
          </div>
          
          {/* Messages Area */}
          <div className="h-[60vh] overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-500">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">How can I help you today?</h3>
                <p className="text-sm">Ask me about properties, rental processes, maintenance, or any other questions you have.</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] p-3 rounded-lg text-sm ${msg.role === "user"
                      ? "bg-black text-white rounded-br-none"
                      : "bg-gray-100 text-gray-800 rounded-bl-none"
                      }`}
                  >
                    <div dangerouslySetInnerHTML={{ __html: msg.parts[0].text.replace(/\n/g, '<br>') }} />
                  </div>
                </div>
              ))
            )}
            
            {/* Loading Dots */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg rounded-bl-none p-3 flex items-center gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={onSubmit} className="p-4 border-t border-gray-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className={`px-4 py-2 rounded-md text-white font-medium ${!input.trim() || isLoading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-black hover:bg-gray-800"
                  }`}
              >
                Send
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              EaseRent AI may produce inaccurate information about people, places, or facts.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
