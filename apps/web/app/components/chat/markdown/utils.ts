export const extractText = (node: React.ReactNode): string => {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const nodeWithProps = node as { props?: { children?: React.ReactNode } };
    return extractText(nodeWithProps.props?.children ?? '');
  }
  return '';
};

export const FULL_HTML_DOC_PATTERN = /^\s*(?:<!DOCTYPE\s+html[^>]*>\s*)?<html[\s\S]*<\/html>\s*$/i;
const EMBEDDED_HTML_DOC_PATTERN = /(?:<!DOCTYPE\s+html[^>]*>\s*)?<html[\s\S]*?<\/html>/i;

// HTML entity decoder - decodes common HTML entities like &lt;, &gt;, &amp;, &quot;, etc.
// Security: Use DOMParser with text/html instead of innerHTML to prevent XSS
function decodeHtmlEntities(text: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<decode>${text}</decode>`, 'text/html');
  return doc.documentElement.textContent ?? text;
}

// LRU cache for normalized markdown content
const normalizeCache = new Map<string, string>();
const MAX_CACHE_SIZE = 100;

export const normalizeMarkdownContent = (content: string): string => {
  // Check cache first
  if (normalizeCache.has(content)) {
    const cached = normalizeCache.get(content);
    return cached ?? content;
  }

  const trimmed = content.trim();
  if (!trimmed) return content;

  // Decode HTML entities first (e.g., &lt; → <, &gt; → >, &amp; → &)
  // This is important because AI responses may contain HTML-encoded characters
  // in JSON strings that break markdown code block parsing
  let decoded = trimmed;
  if (/&(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/.test(trimmed)) {
    decoded = decodeHtmlEntities(trimmed);
  }

  const alreadyCodeBlock = /^```[\w-]*\n[\s\S]*\n```\s*$/m.test(decoded);
  let result: string;

  if (alreadyCodeBlock) {
    result = decoded;
  } else if (FULL_HTML_DOC_PATTERN.test(decoded)) {
    // Wrap full HTML documents in code blocks
    // This allows the preview system to render them in iframes
    result = `\`\`\`html\n${decoded}\n\`\`\``;
  } else if (!decoded.includes('```')) {
    const embeddedHtmlDoc = EMBEDDED_HTML_DOC_PATTERN.exec(decoded);
    if (embeddedHtmlDoc?.[0]) {
      const htmlDoc = embeddedHtmlDoc[0];
      const matchIndex = embeddedHtmlDoc.index ?? 0;
      const prefix = decoded.slice(0, matchIndex).trimEnd();
      const suffix = decoded.slice(matchIndex + htmlDoc.length).trimStart();

      result = [prefix, `\`\`\`html\n${htmlDoc}\n\`\`\``, suffix].filter(Boolean).join('\n\n');
    } else {
      result = decoded;
    }
  } else {
    result = decoded;
  }

  // Cache the result (only cache if content is substantial enough)
  if (content.length > 50) {
    if (normalizeCache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entry (first key)
      const firstKey = normalizeCache.keys().next().value;
      if (firstKey) {
        normalizeCache.delete(firstKey);
      }
    }
    normalizeCache.set(content, result);
  }

  return result;
};

export const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export const hasBalancedHtmlTags = (code: string): boolean => {
  const stack: string[] = [];
  const tagRegex = /<\/?([a-zA-Z][\w:-]*)(\s[^<>]*?)?>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(code)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = fullTag.startsWith('</');
    const isSelfClosing = fullTag.endsWith('/>');

    if (isClosing) {
      const top = stack[stack.length - 1];
      if (top !== tagName) {
        return false;
      }
      stack.pop();
      continue;
    }

    if (!isSelfClosing && !VOID_TAGS.has(tagName)) {
      stack.push(tagName);
    }
  }

  return stack.length === 0;
};

export const isPreviewCodeComplete = (rawCode: string, isSvg: boolean): boolean => {
  const trimmedCode = rawCode.trim();
  if (!trimmedCode) return false;
  if (!/<[a-z!/]/i.test(trimmedCode)) return false;
  if (/<[^>]*$/.test(trimmedCode)) return false;

  // Full HTML documents are always ready for preview
  if (FULL_HTML_DOC_PATTERN.test(trimmedCode)) {
    return true;
  }

  if (isSvg) {
    // For SVG, just need opening tag (closing tag check is too strict for partial SVG)
    if (!/<svg[\s>]/i.test(trimmedCode)) return false;
  } else {
    // For non-SVG code, apply minimal length limits to allow more previews
    const nonEmptyLines = trimmedCode.split('\n').filter((line) => line.trim().length > 0);
    const minLines = 2; // Reduced from 3
    const minChars = 50; // Reduced from 100

    if (nonEmptyLines.length < minLines && trimmedCode.length < minChars) {
      return false;
    }
  }

  // Relax tag balance check for common cases
  // Allow unbalanced tags if the content looks like valid HTML structure
  const hasValidStructure =
    /<\w+[^>]*>.*<\/\w+>/is.test(trimmedCode) || // Has paired tags
    /<\w+[^>]*\/>/i.test(trimmedCode) || // Has self-closing tags
    /<(?:div|span|p|a|button|input|img|br|hr|meta|link)[\s>]/i.test(trimmedCode); // Common HTML elements

  return hasValidStructure || hasBalancedHtmlTags(trimmedCode);
};

export const parseSvgNumber = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const getSvgSize = (svgElement: SVGSVGElement): { width: number; height: number } => {
  const widthAttr = parseSvgNumber(svgElement.getAttribute('width'));
  const heightAttr = parseSvgNumber(svgElement.getAttribute('height'));

  if (widthAttr && heightAttr) {
    return { width: widthAttr, height: heightAttr };
  }

  const viewBox = svgElement.viewBox.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }

  const rect = svgElement.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }

  return { width: 1200, height: 800 };
};

export const downloadSvgElementAsPng = async (
  svgElement: SVGSVGElement,
  filename: string
): Promise<void> => {
  const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
  svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const { width, height } = getSvgSize(svgClone);
  const serializedSvg = new XMLSerializer().serializeToString(svgClone);
  const svgBlob = new Blob([serializedSvg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load SVG for PNG export'));
      image.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D context is not available');
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to convert canvas to PNG'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    });

    const isMobileWebKit =
      /AppleWebKit/i.test(navigator.userAgent) &&
      /Mobile|iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobileWebKit) {
      const file = new File([pngBlob], filename, { type: 'image/png' });
      const shareData = { files: [file], title: filename };

      if (
        typeof navigator.canShare === 'function' &&
        navigator.canShare(shareData) &&
        typeof navigator.share === 'function'
      ) {
        await navigator.share(shareData);
        return;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to open PNG data URL'));
        reader.readAsDataURL(pngBlob);
      });

      const popup = window.open(dataUrl, '_blank');
      if (!popup) {
        window.location.href = dataUrl;
      }
      return;
    }

    const pngUrl = URL.createObjectURL(pngBlob);
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 30_000);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
};
