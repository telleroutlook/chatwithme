export const settings = {
  // Settings Page
  title: 'Settings',
  subtitle: 'Manage your preferences',

  // Language Section
  language: {
    title: 'Language',
    description: 'Choose your preferred language for the interface',
    english: 'English',
    chinese: '中文',
    current: 'Current language: {{language}}',
  },

  // Theme Section
  theme: {
    title: 'Theme',
    description: 'Customize the appearance',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },

  // Profile Section
  profile: {
    title: 'Profile',
    description: 'Update your account information',
    username: 'Username',
    email: 'Email',
    save: 'Save Changes',
    saved: 'Changes saved',
    error: 'Failed to save changes',
  },

  // Actions
  actions: {
    signOut: 'Sign Out',
    signOutConfirm: 'Are you sure you want to sign out?',
  },
} as const;
