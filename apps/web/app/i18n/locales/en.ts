import { common } from '../namespaces/common';
import { auth } from '../namespaces/auth';
import { chat } from '../namespaces/chat';
import { settings } from '../namespaces/settings';

export const en = {
  common,
  auth,
  chat,
  settings,
} as const;

export type EnTranslations = typeof en;
