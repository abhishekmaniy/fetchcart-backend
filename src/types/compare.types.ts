export type CompareJobData = {
  compareId: string
  userId: string
  productUrls: string[]
  title?: string
}

export type CompareSource = "EXISTING_PRODUCTS" | "PRODUCT_URLS";

export type ProductCompareJobData = {
  compareId: string;
  userId: string;
  source: CompareSource;

  productIds?: string[];
  productUrls?: string[];
};


export type CompareEventType =
  | "COMPARE_STARTED"
  | "COMPARE_PRODUCTS_LOADED"
  | "COMPARE_PRODUCT_EXTRACTION_STARTED"
  | "COMPARE_PRODUCT_EXTRACTED"
  | "COMPARE_PRODUCT_FAILED"
  | "COMPARE_ANALYSIS_STARTED"
  | "COMPARE_COMPLETED"
  | "COMPARE_FAILED";

export type CompareSocketEvent = {
  type: CompareEventType;
  compareId: string;

  message?: string;

  total?: number;
  processed?: number;
  failed?: number;

  product?: unknown;

  error?: string;

  createdAt?: string;
};