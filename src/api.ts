/**
 * @author Colin Brown
 * @description API URL configuration helper that constructs API endpoints based on Vite environment variables
 * @fileformat TypeScript
 */

export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export function apiUrl(path: string) {
  if (!path.startsWith('/')) path = '/' + path;
  return `${API_BASE}${path}`;
}

export default apiUrl;
