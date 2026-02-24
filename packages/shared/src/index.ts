// User types
export interface User {
  id: string;
  email: string;
  username: string;
  avatar: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSafe extends Pick<User, 'id' | 'email' | 'username' | 'avatar'> {}

// Conversation types
export interface Conversation {
  id: string;
  userId: string;
  title: string;
  starred: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Message types
export interface MessageFile {
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface Message {
  id: string;
  userId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  message: string;
  files: MessageFile[];
  generatedImageUrls: string[];
  searchResults: SearchResult[];
  suggestions?: string[];
  createdAt: Date;
}

// Auth types
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SignUpRequest {
  email: string;
  username: string;
  password: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: UserSafe;
  tokens: AuthTokens;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// Chat types
export interface SendMessageRequest {
  conversationId: string;
  message: string;
  files?: MessageFile[];
  model?: string;
}

export interface StreamMessageEvent {
  type: 'message' | 'done' | 'error' | 'suggestions';
  message?: string;
  suggestions?: string[];
  error?: string;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string | { code: string; message: string };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// File upload types
export interface UploadResponse {
  file: MessageFile;
}
