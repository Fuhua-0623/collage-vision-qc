/** Error codes returned by {@link CollageVisionQcError}. */
export type CollageVisionQcErrorCode =
  | "INVALID_INPUT"
  | "INVALID_IMAGE"
  | "HTTP_ERROR"
  | "EMPTY_RESPONSE"
  | "INVALID_JSON"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "NO_ATTEMPTS";

export interface CollageVisionQcErrorOptions {
  /** HTTP status code, for `HTTP_ERROR` failures. */
  status?: number;
  /** Original error, if any. */
  cause?: unknown;
}

/**
 * The only error type thrown by this package.
 *
 * Inspect `code` to branch on the failure category and `status` for HTTP errors.
 */
export class CollageVisionQcError extends Error {
  readonly code: CollageVisionQcErrorCode;
  readonly status?: number;

  constructor(
    code: CollageVisionQcErrorCode,
    message: string,
    options: CollageVisionQcErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "CollageVisionQcError";
    this.code = code;
    if (options.status !== undefined) {
      this.status = options.status;
    }
  }
}
