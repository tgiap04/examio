/** Affix breakdown of a word */
export interface WordAffix {
  prefix: string;
  root: string;
  suffix: string;
}

/** Single word within a word family */
export interface WordFamilyWord {
  word: string;
  pos: string;
  meaningEn: string;
  meaningVi: string;
  example: string;
  affix: WordAffix;
}

/** Full word family data (AI-generated, returned by backend) */
export interface WordFamilyData {
  id: string;
  rootWord: string;
  categorySlug: string;
  words: WordFamilyWord[];
  createdAt?: string;
  updatedAt?: string;
}

/** Category with display metadata */
export interface WordFamilyCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** DB record returned by the backend */
export interface WordFamilyRecord {
  id: string;
  rootWord: string;
  categorySlug: string;
  data: WordFamilyData;
  createdAt: string;
  updatedAt: string;
}

/** Root word entry in category detail */
export interface WordFamilyRootWord {
  id: string;
  rootWord: string;
  createdAt: string;
}
