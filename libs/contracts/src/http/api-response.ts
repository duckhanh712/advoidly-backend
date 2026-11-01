/** Metadata attached to every API response. */
export interface ResponseMeta {
  correlationId: string;
  timestamp: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

export interface ApiErrorBody {
  /** Stable, machine-readable error code, e.g. `VALIDATION_FAILED`. */
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
  meta: ResponseMeta & { path: string };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/** Returned by handlers that want a paginated envelope. */
export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}
