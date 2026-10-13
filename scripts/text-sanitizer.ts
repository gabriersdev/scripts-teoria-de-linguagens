export const KNOWN_COMMA_ARTISTS: string[] = [
  "Ryu, the Runner",
  "Tyler, the Creator",
  "Earth, Wind & Fire",
  "Crosby, Stills, Nash & Young",
  "Blood, Sweat & Tears",
  "Emerson, Lake & Palmer"
];

const COMMA_PLACEHOLDER = "__COMMA_TOKEN__";

export interface ParsedArtists {
  primaryArtist: string;
  allArtists: string[];
}

export function parseArtists(rawArtists?: string): ParsedArtists {
  if (!rawArtists || !rawArtists.trim()) {
    return {
      primaryArtist: "",
      allArtists: []
    };
  }

  let maskedString = rawArtists;
  for (const knownArtist of KNOWN_COMMA_ARTISTS) {
    if (maskedString.toLowerCase().includes(knownArtist.toLowerCase())) {
      const regex = new RegExp(knownArtist.replace(/,/g, "\\,"), "gi");
      maskedString = maskedString.replace(regex, knownArtist.replace(/,/g, COMMA_PLACEHOLDER));
    }
  }

  const parts = maskedString.split(",");
  const allArtists = parts
    .map(part => part.replace(new RegExp(COMMA_PLACEHOLDER, "g"), ",").trim())
    .filter(Boolean);

  const primaryArtist = allArtists.length > 0 ? allArtists[0] : "";

  return {
    primaryArtist,
    allArtists
  };
}

export function normalizeString(value: string): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeTitle(rawTitle: string): string {
  if (!rawTitle) return "";

  let cleaned = rawTitle
    .replace(/\s*[\(\[\{]?(ao vivo|live|remaster(?:ed)?|vers[aã]o acústica|acústico)[\)\]\}]?/gi, "")
    .replace(/\s*[\(\[\{]?(?:feat\.?|ft\.?)\s+[^\)\]\}]+[\)\]\}]?/gi, "")
    .replace(/\s*-\s*(ao vivo|live|remaster(?:ed)?|acústico)$/gi, "")
    .trim();

  return cleaned || rawTitle.trim();
}

export function matchArtist(apiArtist: string, candidateArtists: string[]): boolean {
  if (!apiArtist || candidateArtists.length === 0) return false;

  const normalizedApi = normalizeString(apiArtist);
  if (!normalizedApi) return false;

  for (const candidate of candidateArtists) {
    const normalizedCandidate = normalizeString(candidate);
    if (!normalizedCandidate) continue;

    if (normalizedApi === normalizedCandidate) return true;
    if (normalizedApi.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedApi)) {
      return true;
    }
  }

  return false;
}

export function isTitleSimilar(queryTitle: string, resultTitle: string): boolean {
  if (!queryTitle || !resultTitle) return false;

  const normQuery = normalizeString(queryTitle);
  const normResult = normalizeString(resultTitle);

  if (normQuery === normResult) return true;
  if (normResult.includes(normQuery) || normQuery.includes(normResult)) return true;

  const queryTokens = normQuery.split(" ").filter(t => t.length > 2);
  const resultTokens = normResult.split(" ").filter(t => t.length > 2);

  if (queryTokens.length === 0 || resultTokens.length === 0) {
    return normQuery === normResult;
  }

  const matches = queryTokens.filter(t => resultTokens.includes(t));
  const ratio = matches.length / queryTokens.length;

  return ratio >= 0.6;
}

const PORTUGUESE_STOPWORDS = new Set([
  "que", "nao", "com", "para", "pra", "voce", "um", "uma", "se", "meu",
  "minha", "por", "mais", "tudo", "isso", "esse", "essa", "quando", "muito",
  "tem", "nos", "mas", "como", "vai", "dia", "bem", "aqui", "agora", "ja",
  "fazer", "vida", "sem", "sou", "tao", "teu", "tua"
]);

const FOREIGN_STOPWORDS = new Set([
  "the", "you", "and", "with", "that", "this", "for", "have", "from",
  "your", "what", "all", "know", "just", "about", "like", "they", "will",
  "los", "las", "del", "pero", "como", "para", "una", "por", "sobre", "este"
]);

export function isPortugueseLyrics(lyrics: string): boolean {
  if (!lyrics || lyrics.trim().length < 40) return false;

  const lowerText = lyrics.toLowerCase();
  if (
    lowerText.includes("instrumental") ||
    lowerText.includes("paroles non disponibles") ||
    lowerText.includes("lyrics not found") ||
    lowerText.includes("letra indisponível")
  ) {
    return false;
  }

  const normalizedWords = normalizeString(lyrics)
    .split(" ")
    .filter(w => w.length > 1);

  if (normalizedWords.length < 10) return false;

  let ptScore = 0;
  let foreignScore = 0;

  for (const word of normalizedWords) {
    if (PORTUGUESE_STOPWORDS.has(word)) ptScore++;
    if (FOREIGN_STOPWORDS.has(word)) foreignScore++;
  }

  if (foreignScore > 5 && foreignScore > ptScore * 1.5) {
    return false;
  }

  return ptScore >= 3;
}
