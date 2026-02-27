import { common } from '../namespaces/common';
import { auth } from '../namespaces/auth';
import { chat } from '../namespaces/chat';
import { settings } from '../namespaces/settings';

export const zh = {
  common: {
    // Actions
    submit: '提交',
    cancel: '取消',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    copy: '复制',
    copied: '已复制！',
    retry: '重试',
    loading: '加载中...',
    download: '导出',

    // Navigation
    home: '首页',
    settings: '设置',
    signIn: '登录',
    signUp: '注册',
    signOut: '登出',

    // Time
    justNow: '刚刚',
    minutesAgo: '{{minutes}}分钟前',
    hoursAgo: '{{hours}}小时前',
    daysAgo: '{{days}}天前',
    today: '今天',
    yesterday: '昨天',

    // Errors
    error: '错误',
    success: '成功',
    warning: '警告',
    info: '信息',
    somethingWentWrong: '出现错误，请重试。',
    networkError: '网络错误，请检查您的连接。',
    tryAgain: '重试',

    // Common
    and: '和',
    or: '或',
    yes: '是',
    no: '否',
    search: '搜索',
    filter: '筛选',
    clear: '清除',
    close: '关闭',
    open: '打开',
    back: '返回',
    next: '下一步',
    previous: '上一步',
    done: '完成',
  },

  auth: {
    // Sign In
    signIn: {
      title: '欢迎回来',
      subtitle: '登录 ChatWithMe 继续对话',
      emailLabel: '邮箱',
      emailPlaceholder: '请输入邮箱',
      passwordLabel: '密码',
      passwordPlaceholder: '请输入密码',
      submitButton: '登录',
      noAccount: '还没有账号？',
      signUpLink: '注册',
      forgotPassword: '忘记密码？',
      errors: {
        invalidCredentials: '邮箱或密码错误',
        emailRequired: '请输入邮箱',
        passwordRequired: '请输入密码',
      },
    },

    // Sign Up
    signUp: {
      title: '创建账号',
      subtitle: '立即加入 ChatWithMe',
      emailLabel: '邮箱',
      emailPlaceholder: '请输入邮箱',
      usernameLabel: '用户名',
      usernamePlaceholder: '请选择用户名',
      passwordLabel: '密码',
      passwordPlaceholder: '创建密码（至少6个字符）',
      submitButton: '创建账号',
      hasAccount: '已有账号？',
      signInLink: '登录',
      errors: {
        emailTaken: '邮箱已被注册',
        usernameTaken: '用户名已被占用',
        emailRequired: '请输入邮箱',
        usernameRequired: '请输入用户名',
        passwordRequired: '请输入密码',
        passwordTooShort: '密码至少需要6个字符',
      },
    },

    // Sign Out
    signOut: {
      confirm: '确定要登出吗？',
      button: '登出',
    },
  },

  chat: {
    // Header
    header: {
      mobileMenu: '菜单',
      newChat: '新建对话',
      conversationTitle: '对话',
    },

    // Sidebar
    sidebar: {
      conversations: '对话列表',
      searchPlaceholder: '搜索对话...',
      noConversations: '暂无对话',
      startFirst: '开始您的第一次对话',
      newChat: '新建对话',
      today: '今天',
      yesterday: '昨天',
      lastWeek: '最近7天',
      lastMonth: '最近30天',
      older: '更早',
    },

    // Conversation List Item
    conversationItem: {
      starred: '已收藏',
      unstarred: '已取消收藏',
      delete: '删除',
      rename: '重命名',
    },

    // Empty State
    empty: {
      welcome: '欢迎使用 ChatWithMe',
      subtitle: '您的 AI 智能对话助手',
      getStarted: '开始新的对话',
      features: {
        title: '我能为您做些什么？',
        chat: 'AI 驱动的自然对话',
        files: '上传和分析文档',
        images: '处理和理解图片',
        search: '搜索网络信息',
      },
      noConversation: '选择一个对话或开始新的对话',
      startNew: '开始新对话',
    },

    // Message Input
    input: {
      placeholder: '输入您的消息...',
      attachFile: '添加附件',
      uploadFile: '上传文件',
      send: '发送',
      sendButton: '发送消息',
      stop: '停止生成',
      disabled: '请登录后发送消息',
      errors: {
        empty: '消息不能为空',
        tooLong: '消息过长',
        uploadFailed: '文件上传失败',
      },
    },

    // Message Actions
    message: {
      copy: '复制',
      copied: '已复制！',
      regenerate: '重新生成',
      delete: '删除',
      user: '您',
      assistant: '助手',
      thinking: '思考中...',
      error: '出现错误',
      retry: '重试',
    },

    // File Upload
    file: {
      upload: '上传文件',
      dragDrop: '将文件拖到此处',
      or: '或',
      clickToBrowse: '点击选择文件',
      supported: '支持：PDF、图片、Office 文档',
      sizeLimit: '最大文件大小：10MB',
      uploading: '上传中...',
      uploaded: '已上传',
      error: '文件上传失败',
      remove: '移除',
    },

    // Image Analysis
    imageAnalysis: {
      title: '图片分析',
      analyzing: '分析图片中...',
      error: '图片分析失败',
    },

    // Suggestions
    suggestions: {
      title: '建议的后续问题',
      or: '或',
    },

    // Online Status
    status: {
      online: '在线',
      offline: '离线',
      reconnecting: '重新连接中...',
    },
  },

  settings: {
    // Settings Page
    title: '设置',
    subtitle: '管理您的偏好设置',

    // Language Section
    language: {
      title: '语言',
      description: '选择您的界面语言',
      english: 'English',
      chinese: '中文',
      current: '当前语言：{{language}}',
    },

    // Theme Section
    theme: {
      title: '主题',
      description: '自定义外观',
      light: '浅色',
      dark: '深色',
      system: '跟随系统',
    },

    // Profile Section
    profile: {
      title: '个人资料',
      description: '更新您的账号信息',
      username: '用户名',
      email: '邮箱',
      save: '保存更改',
      saved: '更改已保存',
      error: '保存更改失败',
    },

    // Actions
    actions: {
      signOut: '登出',
      signOutConfirm: '确定要登出吗？',
    },
  },
} as const;

export type ZhTranslations = typeof zh;
