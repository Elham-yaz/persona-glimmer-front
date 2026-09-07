/**
 * Input sanitization utilities
 * Removes potentially dangerous characters and normalizes input
 */

export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // Remove control characters except newlines and tabs
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit length (prevent extremely long inputs)
  const MAX_LENGTH = 10000;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LENGTH);
  }

  return sanitized;
}

export function sanitizeMessageContent(content: string): string {
  if (typeof content !== 'string') {
    return '';
  }

  // Allow more characters in messages (newlines, etc.)
  let sanitized = content.replace(/\0/g, ''); // Remove null bytes

  // Remove only the most dangerous control characters
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Trim only leading/trailing whitespace (preserve internal formatting)
  sanitized = sanitized.trim();

  // Limit length
  const MAX_MESSAGE_LENGTH = 5000;
  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    sanitized = sanitized.substring(0, MAX_MESSAGE_LENGTH);
  }

  return sanitized;
}
