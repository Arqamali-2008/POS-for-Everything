export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Response envelope returned by every API client (localStorage or HTTP).
 * The shape matches the Express backend responses.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  pagination?: Pagination;
  message?: string;
}
