import { genAI } from "../config/gemini";

const model = genAI.getGenerativeModel({
  model: "gemini-3.5-flash",
});

export const generateSearchTitle = async (
  query: string,
  filters?: Record<string, string | number | string[]>
) => {
  try {
    const prompt = `
Generate a short clean ecommerce search title.

Rules:
- Max 8 words
- Fix spelling mistakes
- No extra words like "product", "with", "under"
- Include brand, budget, and important filters if available
- Return only plain title, no quotes

User query:
${query}

Filters:
${JSON.stringify(filters || {}, null, 2)}
`;

    const result = await model.generateContent(prompt);
    const title = result.response.text().trim();

    return title || query;
  } catch {
    return query;
  }
};