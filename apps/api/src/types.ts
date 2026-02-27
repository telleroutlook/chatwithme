// API Types (duplicated from shared package to avoid workspace dependency issues)

export type AppLocale = 'en' | 'zh';

export interface UserSafe {
  id: string;
  email: string;
  username: string;
  avatar: string;
  language: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: UserSafe;
  tokens: AuthTokens;
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
