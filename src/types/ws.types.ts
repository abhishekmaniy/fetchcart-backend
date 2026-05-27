export type SearchEventType =
  | "SEARCH_STARTED"
  | "PRODUCTS_FOUND"
  | "PRODUCT_SCRAPING_STARTED"
  | "PRODUCT_SAVED"
  | "PRODUCT_FAILED"
  | "SEARCH_COMPLETED"
  | "SEARCH_FAILED";

export type SearchSocketEvent = {
  type: SearchEventType;
  searchId: string;

  message?: string;

  total?: number;
  processed?: number;
  failed?: number;

  product?: unknown;

  error?: string;

  createdAt?: string;
};