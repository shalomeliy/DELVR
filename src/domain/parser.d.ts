export interface ParsedAddress {
  street: string;
  number: string | null;
  city: string | null;
  apartment: string | null;
  floor: string | null;
  entrance: string | null;
  code: string | null;
  geocodeQuery: string;
  flags: string[];
}
export function parseTranscript(text: string, opts?: { defaultCity?: string | null }): ParsedAddress[];
