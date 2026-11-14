import type { AxiosResponse } from "axios";

/**
 * The shared axios interceptor rewrites every failed response into a bare
 * `Error(message)`, which drops the HTTP status and the machine code the UI
 * needs (`CODE_LOCKED` + retry seconds, `SHARE_LIST_FULL`, `ALREADY_SUBMITTED`).
 * Calls that depend on those pass `validateStatus: acceptDomainStatuses` and
 * hand the response to `unwrap`, so 400/409/429 arrive as a typed `ApiFailure`.
 * 401 (token refresh), 403, 404 and 5xx still go through the interceptor.
 */
export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}

export function acceptDomainStatuses(status: number): boolean {
  return (
    (status >= 200 && status < 300) ||
    status === 400 ||
    status === 409 ||
    status === 429
  );
}

interface FailureBody {
  code?: unknown;
  message?: unknown;
  retryAfterSeconds?: unknown;
}

export function toApiFailure(status: number, data: unknown): ApiFailure {
  const body: FailureBody = data && typeof data === "object" ? (data as FailureBody) : {};
  const message = typeof body.message === "string" ? body.message : "Yêu cầu không hợp lệ";
  return new ApiFailure(
    message,
    status,
    typeof body.code === "string" ? body.code : undefined,
    typeof body.retryAfterSeconds === "number" ? body.retryAfterSeconds : undefined,
  );
}

/** Body of a 2xx response; anything else throws an `ApiFailure`. */
export function unwrap<T>(response: Pick<AxiosResponse<T>, "status" | "data">): T {
  if (response.status >= 200 && response.status < 300) return response.data;
  throw toApiFailure(response.status, response.data);
}

export const isFailure = (error: unknown, code: string): boolean =>
  error instanceof ApiFailure && error.code === code;

/** "Nhập sai quá nhiều lần, thử lại sau {n} phút" for a 429 CODE_LOCKED. */
export function lockedMessage(retryAfterSeconds: number | undefined): string {
  const minutes = Math.max(1, Math.ceil((retryAfterSeconds ?? 60) / 60));
  return `Nhập sai quá nhiều lần, thử lại sau ${minutes} phút`;
}

export const SHARE_LIST_FULL_MESSAGE = "Danh sách chia sẻ đã đạt tối đa 2000 người";
