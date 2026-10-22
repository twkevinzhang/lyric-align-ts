import type { ErrorCode, LibraryError } from "./contract.ts";

export function failure(code: ErrorCode, message: string): LibraryError {
  return { code, message };
}

const codes: readonly string[] = [
  "UNSUPPORTED_LANGUAGE",
  "UNSUPPORTED_DEVICE",
  "UNSUPPORTED_OPTION",
  "MODEL_LOAD_FAILED",
  "INVALID_INPUT",
  "OUT_OF_MEMORY",
  "TRANSCRIPTION_FAILED",
  "ALIGNMENT_FAILED",
  "ABORTED",
];
export function libraryError(
  error: unknown,
  fallback: ErrorCode,
): LibraryError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    codes.includes(String(error.code)) &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error as LibraryError;
  const message = error instanceof Error ? error.message : String(error);
  return failure(
    /out of memory|allocation failed|memory access out of bounds/i.test(message)
      ? "OUT_OF_MEMORY"
      : fallback,
    message,
  );
}
