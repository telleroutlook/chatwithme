export const auth = {
  // Sign In
  signIn: {
    title: 'Welcome Back',
    subtitle: 'Sign in to continue to ChatWithMe',
    emailLabel: 'Email',
    emailPlaceholder: 'Enter your email',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter your password',
    submitButton: 'Sign In',
    noAccount: "Don't have an account?",
    signUpLink: 'Sign Up',
    forgotPassword: 'Forgot password?',
    errors: {
      invalidCredentials: 'Invalid email or password',
      emailRequired: 'Email is required',
      passwordRequired: 'Password is required',
    },
  },

  // Sign Up
  signUp: {
    title: 'Create Account',
    subtitle: 'Join ChatWithMe today',
    emailLabel: 'Email',
    emailPlaceholder: 'Enter your email',
    usernameLabel: 'Username',
    usernamePlaceholder: 'Choose a username',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Create a password (min. 6 characters)',
    submitButton: 'Create Account',
    hasAccount: 'Already have an account?',
    signInLink: 'Sign In',
    errors: {
      emailTaken: 'Email already registered',
      usernameTaken: 'Username already taken',
      emailRequired: 'Email is required',
      usernameRequired: 'Username is required',
      passwordRequired: 'Password is required',
      passwordTooShort: 'Password must be at least 6 characters',
    },
  },

  // Sign Out
  signOut: {
    confirm: 'Are you sure you want to sign out?',
    button: 'Sign Out',
  },
} as const;
