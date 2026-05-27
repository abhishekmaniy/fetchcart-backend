import { and, count, desc, eq, gte } from 'drizzle-orm';
import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

import db from "../config/db";
import { genAI } from "../config/gemini";
import { productsTable, searchesTable } from "../db/schema";
import { productSearchQueue } from "../queues/search.queue";
import { FormField, GenerateFormAIResponse } from "../types/generate-form.types";

const buildSearchQuery = (
  query: string,
  filters?: Record<string, string | number | string[]>
) => {
  let searchQuery = `${query} product`;

  if (!filters) return searchQuery;

  Object.entries(filters).forEach(([key, value]) => {
    if (key === "budget" && typeof value === "number") {
      searchQuery += ` under ₹${value}`;
    } else if (Array.isArray(value)) {
      searchQuery += ` with ${value.join(", ")}`;
    } else if (typeof value === "string") {
      searchQuery += ` ${value}`;
    }
  });

  return searchQuery;
};

export const createSearchJob = async (req: Request, res: Response) => {
  try {
    const { query, filters } = req.body;
    const userId = req.user?.id;

    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({
        error: "Missing query",
      });
    }

    if (!userId) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const searchId = uuidv4();
    const searchQuery = buildSearchQuery(query.trim(), filters);

    const fallbackTitle =
      query.trim().length > 80
        ? `${query.trim().slice(0, 80)}...`
        : query.trim();

    const createdAt = new Date();

    await db.insert(searchesTable).values({
      id: searchId,
      userId,
      title: fallbackTitle,
      query: searchQuery,
      status: "QUEUED",
      totalProductsFound: 0,
      processedProducts: 0,
      failedProducts: 0,
      errorMessage: null,
      createdAt,
      updatedAt: createdAt,
    });

    await productSearchQueue.add("product-search", {
      searchId,
      userId,
      query: searchQuery,
      filters,
    });

    return res.status(202).json({
      message: "Search job created successfully",
      search: {
        id: searchId,
        title: fallbackTitle,
        query: searchQuery,
        status: "QUEUED",
        createdAt: createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Create search job error:", error);

    return res.status(500).json({
      error: "Failed to create search job",
    });
  }
};

export const getSearchById = async (req: Request, res: Response) => {
  try {
    const { searchId } = req.params;
    const userId = req.user?.id;

    const likedQuery = req.query.liked;

    if (!searchId || !userId) {
      return res.status(400).json({
        error: "Missing searchId or userId",
      });
    }

    const [search] = await db
      .select()
      .from(searchesTable)
      .where(
        and(
          eq(searchesTable.id, searchId),
          eq(searchesTable.userId, userId)
        )
      );

    if (!search) {
      return res.status(404).json({
        error: "Search not found",
      });
    }

    const productConditions = [eq(productsTable.searchId, searchId)];

    if (likedQuery === "true") {
      productConditions.push(eq(productsTable.isLiked, true));
    }

    if (likedQuery === "false") {
      productConditions.push(eq(productsTable.isLiked, false));
    }

    const products = await db
      .select()
      .from(productsTable)
      .where(and(...productConditions));

    return res.json({
      search: {
        ...search,
        products,
      },
    });
  } catch (error) {
    console.error("Get search by ID error:", error);

    return res.status(500).json({
      error: "Failed to fetch search",
    });
  }
};

function safeJsonParse(raw: string): GenerateFormAIResponse | null {
  try {
    const cleaned = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start === -1 || end === -1) return null;

    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeFields(fields: FormField[] = []) {
  return fields
    .filter((field) => field?.name && field?.label && field?.type)
    .slice(0, 6);
}

export const generateForm = async (req: Request, res: Response) => {
  try {
    const { query } = req.body as { query?: string };

    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({
        success: false,
        error: "Missing query",
      });
    }

    const prompt = `
You are an intelligent dynamic form generation engine.

Your task is to analyze the user's query and generate a highly relevant form schema that collects ONLY the missing information required to better fulfill the user's intent.

USER QUERY:
"${query}"

CORE OBJECTIVE:
Understand:
1. What the user is trying to achieve.
2. What information is already explicitly or implicitly provided.
3. What important information is still missing.
4. What follow-up questions are actually useful.

IMPORTANT BEHAVIOR RULES:

1. NEVER ask for information already provided
- If the user already mentioned something, do not ask it again.
- Detect explicit and implicit constraints.
- Extract all identifiable filters/preferences from the query.

Examples:
- "I want black Nike running shoes"
  → do not ask color or brand again.
- "Need a gaming laptop for video editing"
  → understand intended usage already exists.
- "Book me a hotel near airport"
  → location preference already exists.

2. ASK ONLY HIGH-VALUE QUESTIONS
Every generated field must help narrow down or improve results meaningfully.

Avoid:
- generic
- repetitive
- low-signal
- unnecessary questions

Good questions:
- clarify ambiguity
- refine intent
- capture missing constraints
- improve recommendation quality

3. BE CONTEXT AWARE
Different intents require different forms.

Examples:
- Clothing → size, fit, material, occasion
- Electronics → usage, specs, battery, storage
- Travel → destination, duration, travelers
- Food → dietary preference, cuisine, spice level
- Services → urgency, budget, experience level
- Jobs → role, experience, location, salary expectation

4. MINIMIZE FORM LENGTH
- Prefer fewer highly relevant questions.
- Maximum 6 fields.
- If the query is already highly specific, generate very few or even zero fields.

5. GENERATE NATURAL UX-FRIENDLY FIELDS
Fields should feel natural and conversational.

Good:
- "Preferred fit"
- "How will you use this?"
- "Select your size"

Bad:
- "additional_preference_input"
- "miscellaneous"

6. USE APPROPRIATE FIELD TYPES
Use the most suitable input type:
- text
- textarea
- select
- radio
- checkbox
- slider

Guidelines:
- radio → few mutually exclusive options
- checkbox → multi-select preferences
- slider → ranges or quantities
- select → structured choices
- text → open-ended specific input

7. OPTIONS MUST BE CONTEXTUAL
Options must match the domain and user intent.

Bad:
["Option 1", "Option 2"]

Good:
["Casual", "Formal", "Sports"]

8. EXTRACT KNOWN INFORMATION
Create an "extractedFilters" object containing all identifiable structured information already present in the query.

Include:
- categories
- brands
- colors
- sizes
- intents
- usage
- locations
- quantities
- preferences
- constraints
- time-related info
- delivery expectations
- product/service types
- any other meaningful structured data

9. DO NOT HALLUCINATE
Only infer information that is reasonably implied by the query.
Do not invent user preferences.

10. FRONTEND FRIENDLY OUTPUT
Return clean structured JSON only.

OUTPUT FORMAT:

{
  "intent": "short description of user goal",
  "category": "detected category or null",
  "extractedFilters": {},
  "formSchema": [
    {
      "name": "usage",
      "label": "How will you use this?",
      "type": "radio",
      "options": ["Gaming", "Work", "Editing"]
    }
  ]
}

STRICT RULES:
- Return ONLY valid JSON.
- No markdown.
- No explanation text.
- No comments.
- No extra formatting.
- Do not wrap inside code blocks.
`;

    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent(prompt);
    const raw = result.response.text();

    const parsed = safeJsonParse(raw);

    if (!parsed) {
      return res.status(500).json({
        success: false,
        error: "Failed to parse AI response",
      });
    }

    const formSchema = normalizeFields(parsed.formSchema);

    return res.status(200).json({
      success: true,
      query,
      intent: parsed.intent,
      productType: parsed.productType,
      extractedFilters: parsed.extractedFilters || {},
      formSchema,
    });
  } catch (err) {
    console.error("Form generation error:", err);

    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
};

type SearchHistoryFilter = 'all' | 'recent' | 'favorites'

export const getSearchHistory = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      })
    }

    const page = Math.max(Number(req.query.page) || 1, 1)
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
    const offset = (page - 1) * limit

    const filter = String(req.query.filter || 'all') as SearchHistoryFilter

    const conditions = [eq(searchesTable.userId, userId)]

    if (filter === 'favorites') {
      conditions.push(eq(searchesTable.isFavorite, true))
    }

    if (filter === 'recent') {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000)
      conditions.push(gte(searchesTable.createdAt, last24Hours))
    }

    const whereCondition = and(...conditions)

    const [totalResult] = await db
      .select({
        count: count()
      })
      .from(searchesTable)
      .where(whereCondition)

    const searches = await db
      .select()
      .from(searchesTable)
      .where(whereCondition)
      .orderBy(desc(searchesTable.createdAt))
      .limit(limit)
      .offset(offset)

    const total = Number(totalResult?.count || 0)
    const totalPages = Math.ceil(total / limit)

    return res.status(200).json({
      success: true,
      filter,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      searches: searches.map(search => ({
        ...search,
        productsCount: search.processedProducts
      }))
    })
  } catch (error) {
    console.error('Get search history error:', error)

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch search history'
    })
  }
}

export const deleteSearchById = async (req: Request, res: Response) => {
  try {
    const { searchId } = req.params;
    const userId = req.user?.id;

    if (!searchId) {
      return res.status(400).json({
        success: false,
        error: "Missing searchId",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const [existingSearch] = await db
      .select({
        id: searchesTable.id,
      })
      .from(searchesTable)
      .where(
        and(
          eq(searchesTable.id, searchId),
          eq(searchesTable.userId, userId)
        )
      );

    if (!existingSearch) {
      return res.status(404).json({
        success: false,
        error: "Search not found",
      });
    }

    await db
      .delete(searchesTable)
      .where(
        and(
          eq(searchesTable.id, searchId),
          eq(searchesTable.userId, userId)
        )
      );

    return res.status(200).json({
      success: true,
      message: "Search deleted successfully",
      deletedSearchId: searchId,
    });
  } catch (error) {
    console.error("Delete search error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to delete search",
    });
  }
};

export const toggleSearchFavorite = async (req: Request, res: Response) => {
  try {
    const { searchId } = req.params;
    const userId = req.user?.id;

  if (!searchId) {
      return res.status(400).json({
        success: false,
        error: "Missing searchId",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const [existingSearch] = await db
      .select({
        id: searchesTable.id,
        isFavorite: searchesTable.isFavorite,
      })
      .from(searchesTable)
      .where(
        and(
          eq(searchesTable.id, searchId),
          eq(searchesTable.userId, userId)
        )
      );

    if (!existingSearch) {
      return res.status(404).json({
        success: false,
        error: "Search not found",
      });
    }

    const nextFavoriteValue = !existingSearch.isFavorite;

    const [updatedSearch] = await db
      .update(searchesTable)
      .set({
        isFavorite: nextFavoriteValue,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(searchesTable.id, searchId),
          eq(searchesTable.userId, userId)
        )
      )
      .returning({
        id: searchesTable.id,
        isFavorite: searchesTable.isFavorite,
        updatedAt: searchesTable.updatedAt,
      });

    return res.status(200).json({
      success: true,
      message: nextFavoriteValue
        ? "Search added to favorites"
        : "Search removed from favorites",
      search: updatedSearch,
    });
  } catch (error) {
    console.error("Toggle search favorite error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to update favorite status",
    });
  }
};