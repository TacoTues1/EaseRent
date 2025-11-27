import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, history } = req.body || {};
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: "Server misconfiguration: GEMINI_API_KEY not set." });
  }

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'prompt' in request body." });
  }

  try {
    const genAI = new GoogleGenerativeAI(API_KEY);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: {
        parts: [
          {
            text: "You are a helpful AI assistant. You are a text-based model. You CANNOT generate images, videos, or audio files.",
          },
        ],
        role: "system",
      },
    });

    const generationConfig = {
      temperature: 0.9,
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048,
    };

    const filteredHistory = Array.isArray(history)
      ? history.filter((m, i) => i > 0 || m.role === "user")
      : undefined;

    const chat = model.startChat({
      generationConfig,
      history: filteredHistory,
    });

    const result = await chat.sendMessage(prompt);
    const text = result.response?.text?.() ?? "";

    return res.status(200).json({ text });
  } catch (error) {
    console.error("/api/generate error:", error);
    const message = error?.message || String(error);
    return res.status(500).json({ error: message });
  }
}
