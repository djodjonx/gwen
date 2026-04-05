/**
 * @gwenjs/audio error codes
 *
 * Error codes emitted by the GWEN Audio plugin for logging and debugging.
 */

/** Error codes emitted by the GWEN Audio plugin. */
export const AudioErrorCodes = {
  /** Audio preload failed (fetch, decode, or other initialization error). */
  PRELOAD_FAILED: 'AUDIO:PRELOAD_FAILED',
  /** Audio decoding error (unsupported format, corrupted data, etc.). */
  DECODE_ERROR: 'AUDIO:DECODE_ERROR',
} as const;

/** Type of an Audio error code string. */
export type AudioErrorCode = (typeof AudioErrorCodes)[keyof typeof AudioErrorCodes];
