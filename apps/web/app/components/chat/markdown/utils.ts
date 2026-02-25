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

const FULL_HTML_DOC_PATTERN =
  /^\s*(?:<!DOCTYPE\s+html[^>]*>\s*)?<html[\s\S]*<\/html>\s*$/i;

export const normalizeMarkdownContent = (content: string): string => {
  const trimmed = content.trim();
  if (!trimmed) return content;

  const alreadyCodeBlock = /^```[\w-]*\n[\s\S]*\n```\s*$/m.test(trimmed);
  if (alreadyCodeBlock) return content;

  if (FULL_HTML_DOC_PATTERN.test(trimmed)) {
    return `\`\`\`html\n${trimmed}\n\`\`\``;
  }

  return content;
};

export const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
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

  if (isSvg) {
    if (!/<svg[\s>]/i.test(trimmedCode)) return false;
    if (!/<\/svg>/i.test(trimmedCode)) return false;
  } else {
    // For non-SVG code, apply length limits to avoid showing preview for short snippets
    const nonEmptyLines = trimmedCode.split('\n').filter((line) => line.trim().length > 0);
    const minLines = 3;
    const minChars = 100;

    if (nonEmptyLines.length < minLines && trimmedCode.length < minChars) {
      return false;
    }
  }

  return hasBalancedHtmlTags(trimmedCode);
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
