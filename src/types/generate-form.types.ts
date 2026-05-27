
export type FormField =
  | {
      name: string;
      label: string;
      type: "text";
      placeholder?: string;
      required?: boolean;
    }
  | {
      name: string;
      label: string;
      type: "slider";
      min: number;
      max: number;
      step: number;
      required?: boolean;
    }
  | {
      name: string;
      label: string;
      type: "radio" | "checkbox" | "select";
      options: string[];
      required?: boolean;
    };

export type GenerateFormAIResponse = {
  intent: string;
  productType: string | null;
  extractedFilters: Record<string, string | number | boolean | string[] | null>;
  formSchema: FormField[];
};