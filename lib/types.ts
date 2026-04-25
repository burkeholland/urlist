// Shared types for The Urlist

export interface ListRecord {
  slug: string;
  description: string;
  ownerId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LinkRecord {
  url: string;
  position: number;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogSiteName: string | null;
  createdAt: number;
}

export interface LinkWithId extends LinkRecord {
  id: string;
}

export interface ListWithLinks {
  listId: string;
  slug: string;
  description: string;
  ownerId: string | null;
  createdAt: number;
  updatedAt: number;
  links: LinkWithId[];
}

export interface DraftLink {
  id: string;
  url: string;
  position: number;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogSiteName: string | null;
  ogLoading?: boolean;
}

export interface Draft {
  slug: string;
  description: string;
  links: DraftLink[];
  savedAt: number;
}

export interface OgMetadata {
  url: string;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogSiteName: string | null;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    retryAfter?: number;
  };
}

export interface SlugValidationResult {
  slug: string;
  available: boolean;
}

export interface PublishRequest {
  slug?: string;
  description?: string;
  links: {
    url: string;
    position: number;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImage: string | null;
    ogSiteName: string | null;
  }[];
}

export interface PublishResponse {
  listId: string;
  slug: string;
  publicUrl: string;
  createdAt: number;
}

export interface UpdateRequest {
  description?: string;
  updatedAt: number;
  links?: {
    id?: string;
    url: string;
    position: number;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImage: string | null;
    ogSiteName: string | null;
  }[];
}

export interface UpdateResponse {
  listId: string;
  updatedAt: number;
}

export interface DeleteResponse {
  deleted: boolean;
  listId: string;
}

export type SlugValidationStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'taken';
