import { MODEL } from "../protocol.ts";
import { failure } from "./errors.ts";
import { workerSession } from "./transport.ts";
import type { Capabilities, LyricAlignBinding } from "./contract.ts";
export type * from "./contract.ts";

/** Fixed model configuration; no model selection or automatic backend fallback. */
export function createBinding(
  options: { device?: "wasm" | "webgpu" } = {},
): LyricAlignBinding {
  const device = options.device ?? "webgpu";
  if (device !== "wasm" && device !== "webgpu")
    throw failure("UNSUPPORTED_DEVICE", "Supported devices: wasm, webgpu");
  for (const key of Object.keys(options))
    if (key !== "device")
      throw failure("UNSUPPORTED_OPTION", `Unsupported binding option: ${key}`);
  const capabilities: Capabilities = Object.freeze({
    contractVersion: 1,
    libraryVersion: "0.1.0",
    supportedLanguages: Object.freeze(["en"]),
    model: Object.freeze({ ...MODEL, device, dtype: "q4" }),
    alignmentOptions: Object.freeze([
      "pairing",
      "threshold",
      "window",
      "karaoke",
    ] as const),
    lyricsContext: false,
  });
  return Object.freeze({
    capabilities,
    async createSession() {
      if (
        typeof Worker === "undefined" ||
        (device === "webgpu" &&
          (typeof navigator === "undefined" || !navigator.gpu))
      )
        throw failure(
          "UNSUPPORTED_DEVICE",
          `Browser ${device} worker support is required`,
        );
      try {
        return workerSession(
          new Worker(new URL("./worker.ts", import.meta.url), {
            type: "module",
          }),
          device,
        );
      } catch (error) {
        throw failure(
          "UNSUPPORTED_DEVICE",
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });
}
export const binding: LyricAlignBinding = createBinding();
