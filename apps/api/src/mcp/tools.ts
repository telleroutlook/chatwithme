// Define tool schemas for web search and web reader
// Using OpenAI Function Calling format, compatible with GLM-4.7
// Tool names match the MCP service definitions

import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const WEB_SEARCH_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'webSearchPrime',
    description: '搜索互联网以获取最新信息、新闻、实时数据。当用户询问当前事件、最新资讯、时效性问题时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        search_query: {
          type: 'string',
          description: '搜索关键词或问题'
        },
        location: {
          type: 'string',
          description: '搜索区域 (cn/us)',
          default: 'cn'
        },
        search_recency_filter: {
          type: 'string',
          description: '时间过滤 (noLimit/oneDay/threeDays/oneWeek)',
          default: 'noLimit'
        },
        content_size: {
          type: 'string',
          description: '内容大小 (medium/high)',
          default: 'medium'
        }
      },
      required: ['search_query']
    }
  }
};

export const WEB_READER_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'webReader',
    description: '读取指定网页的内容。当用户提供 URL 或要求分析某个网页时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '要读取的网页 URL'
        },
        return_format: {
          type: 'string',
          description: '返回格式 (markdown/text)',
          default: 'markdown'
        }
      },
      required: ['url']
    }
  }
};

export const AVAILABLE_TOOLS: ChatCompletionTool[] = [
  WEB_SEARCH_TOOL,
  WEB_READER_TOOL
];
