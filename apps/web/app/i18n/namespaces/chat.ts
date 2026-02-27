export const chat = {
  // Header
  header: {
    mobileMenu: 'Menu',
    newChat: 'New Chat',
    conversationTitle: 'Conversation',
  },

  // Sidebar
  sidebar: {
    conversations: 'Conversations',
    searchPlaceholder: 'Search conversations...',
    noConversations: 'No conversations yet',
    startFirst: 'Start your first conversation',
    newChat: 'New Chat',
    today: 'Today',
    yesterday: 'Yesterday',
    lastWeek: 'Last 7 days',
    lastMonth: 'Last 30 days',
    older: 'Older',
  },

  // Conversation List Item
  conversationItem: {
    starred: 'Starred',
    unstarred: 'Unstarred',
    delete: 'Delete',
    rename: 'Rename',
  },

  // Empty State
  empty: {
    welcome: 'Welcome to ChatWithMe',
    subtitle: 'Your AI-powered conversation assistant',
    getStarted: 'Start a new conversation',
    features: {
      title: 'What can I help you with?',
      chat: 'Natural conversations powered by AI',
      files: 'Upload and analyze documents',
      images: 'Process and understand images',
      search: 'Search the web for information',
    },
    noConversation: 'Select a conversation or start a new one',
    startNew: 'Start New Chat',
  },

  // Message Input
  input: {
    placeholder: 'Type your message...',
    attachFile: 'Attach file',
    uploadFile: 'Upload file',
    send: 'Send',
    sendButton: 'Send message',
    stop: 'Stop generating',
    disabled: 'Please sign in to send messages',
    errors: {
      empty: 'Message cannot be empty',
      tooLong: 'Message is too long',
      uploadFailed: 'Failed to upload file',
    },
  },

  // Message Actions
  message: {
    copy: 'Copy',
    copied: 'Copied!',
    regenerate: 'Regenerate',
    delete: 'Delete',
    user: 'You',
    assistant: 'Assistant',
    thinking: 'Thinking...',
    error: 'Something went wrong',
    retry: 'Retry',
  },

  // File Upload
  file: {
    upload: 'Upload File',
    dragDrop: 'Drag and drop files here',
    or: 'or',
    clickToBrowse: 'click to browse',
    supported: 'Supported: PDF, Images, Office documents',
    sizeLimit: 'Max file size: 10MB',
    uploading: 'Uploading...',
    uploaded: 'Uploaded',
    error: 'Failed to upload file',
    remove: 'Remove',
  },

  // Image Analysis
  imageAnalysis: {
    title: 'Image Analysis',
    analyzing: 'Analyzing image...',
    error: 'Failed to analyze image',
  },

  // Suggestions
  suggestions: {
    title: 'Suggested follow-ups',
    or: 'or',
  },

  // Online Status
  status: {
    online: 'Online',
    offline: 'Offline',
    reconnecting: 'Reconnecting...',
  },
} as const;
