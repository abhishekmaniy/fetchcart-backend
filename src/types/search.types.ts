export type SearchFilters = Record<string, string | number | string[]>;

export type ProductSearchJobData = {
  searchId: string;
  userId: string;
  query: string;
  filters?: SearchFilters;
};