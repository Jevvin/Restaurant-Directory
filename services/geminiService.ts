import { GoogleGenAI } from "@google/genai";

// Initialize Gemini API
// Note: In a real production app, API keys should be handled via a backend proxy.
// For this demo, we assume process.env.API_KEY is available.
const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const generateAIAnswer = async (question: string, context: string): Promise<string> => {
  if (!apiKey) return "Clave de API no configurada.";

  try {
    const model = 'gemini-2.5-flash';
    const prompt = `
      Actúa como un asistente útil para un restaurante.
      Contexto sobre el restaurante: ${context}
      
      Pregunta del usuario: "${question}"
      
      Responde de manera concisa, amable y útil en español. Máximo 50 palabras.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    return response.text || "Lo siento, no pude generar una respuesta en este momento.";
  } catch (error) {
    console.error("Error generating AI answer:", error);
    return "Hubo un error al conectar con el asistente virtual.";
  }
};

export const generateRestaurantDescription = async (name: string, cuisine: string[]): Promise<string> => {
  if (!apiKey) return "Descripción no disponible.";
  
  try {
    const model = 'gemini-2.5-flash';
    const prompt = `Escribe una descripción breve, atractiva y elegante (máximo 2 párrafos) para un restaurante llamado "${name}" que sirve comida: ${cuisine.join(', ')}. En español.`;
    
    const response = await ai.models.generateContent({
        model,
        contents: prompt
    });
    return response.text || "";
  } catch (error) {
      return "";
  }
}