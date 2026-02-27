/**
 * Vega-Lite detection utilities
 * Detects if JSON content is a valid Vega-Lite specification
 */

/**
 * Vega-Lite specification features to detect
 */
const VEGA_LITE_MARKS = new Set([
  'arc',
  'area',
  'bar',
  'boxplot',
  'circle',
  'errorband',
  'errorbar',
  'geoshape',
  'image',
  'line',
  'point',
  'rect',
  'rule',
  'square',
  'text',
  'tick',
  'trail',
]);

const VEGA_LITE_ENCODING_FIELDS = new Set([
  'x',
  'y',
  'x2',
  'y2',
  'xError',
  'yError',
  'xError2',
  'yError2',
  'color',
  'opacity',
  'fill',
  'fillOpacity',
  'stroke',
  'strokeOpacity',
  'strokeWidth',
  'size',
  'shape',
  'text',
  'angle',
  'theta',
  'radius',
  'detail',
  'key',
  'order',
  'facet',
  'href',
  'tooltip',
  'description',
]);

/**
 * Check if a parsed JSON object is a Vega-Lite specification
 */
function isVegaLiteSpecObject(spec: unknown): boolean {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return false;
  }

  const obj = spec as Record<string, unknown>;

  // Check $schema for Vega-Lite
  if (typeof obj.$schema === 'string' && obj.$schema.includes('vega-lite')) {
    return true;
  }

  // Check for Vega-Lite mark (required for simple specs)
  if (typeof obj.mark === 'string' && VEGA_LITE_MARKS.has(obj.mark)) {
    // Must have at least one of: encoding, data, layer, hconcat, vconcat, facet
    if (
      obj.encoding ||
      obj.data ||
      obj.layer ||
      obj.hconcat ||
      obj.vconcat ||
      obj.facet ||
      obj.spec
    ) {
      return true;
    }
  }

  // Check for mark definition object
  if (obj.mark && typeof obj.mark === 'object') {
    const markDef = obj.mark as Record<string, unknown>;
    if (typeof markDef.type === 'string' && VEGA_LITE_MARKS.has(markDef.type)) {
      return true;
    }
  }

  // Check for encoding with valid Vega-Lite channels
  if (obj.encoding && typeof obj.encoding === 'object') {
    const encoding = obj.encoding as Record<string, unknown>;
    const hasValidChannel = Object.keys(encoding).some((key) => VEGA_LITE_ENCODING_FIELDS.has(key));
    if (hasValidChannel && (obj.mark || obj.data)) {
      return true;
    }
  }

  // Check for layered specs (layer array containing Vega-Lite specs)
  if (Array.isArray(obj.layer)) {
    return obj.layer.length > 0 && isVegaLiteSpecObject(obj.layer[0]);
  }

  // Check for concatenated views
  if (Array.isArray(obj.hconcat) || Array.isArray(obj.vconcat)) {
    const views = (obj.hconcat as unknown[]) || (obj.vconcat as unknown[]);
    return views.length > 0 && isVegaLiteSpecObject(views[0]);
  }

  // Check for faceted spec
  if (obj.facet && obj.spec) {
    return true;
  }

  return false;
}

/**
 * Detect if a JSON string is a Vega-Lite specification
 * Uses multiple heuristics for robust detection
 */
export function isVegaLiteSpec(jsonString: string): boolean {
  if (!jsonString || typeof jsonString !== 'string') {
    return false;
  }

  const trimmed = jsonString.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return false;
  }

  try {
    const spec = JSON.parse(trimmed);
    return isVegaLiteSpecObject(spec);
  } catch {
    return false;
  }
}

/**
 * Parse Vega-Lite spec safely
 * Returns null if not valid JSON or not a Vega-Lite spec
 */
export function parseVegaLiteSpec(jsonString: string): Record<string, unknown> | null {
  try {
    const spec = JSON.parse(jsonString);
    if (isVegaLiteSpecObject(spec)) {
      return spec;
    }
    return null;
  } catch {
    return null;
  }
}
