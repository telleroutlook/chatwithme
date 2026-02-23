// API Types (duplicated from shared package to avoid workspace dependency issues)

// User types
export interface UserSafe {
  id: string;
  email: string;
  username: string;
  avatar: string;
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

// Chat types
export interface SendMessageRequest {
  conversationId: string;
  message: string;
  files?: MessageFile[];
  model?: string;
}

export interface MessageFile {
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface UploadResponse {
  file: MessageFile;
}
