/** Browser library contract v1, shared structurally with yt-subtitle. */
export interface Word {
  start: number;
  end: number;
  word: string;
}
export interface Segment {
  start: number;
  end: number;
  text: string;
  words?: readonly Word[];
}
export interface AlignedLine {
  line: string;
  start: number | null;
  end: number | null;
  /** Text similarity, never timestamp accuracy. */
  score: number;
  matched: boolean;
  /** Opaque until the library specifies a character timing schema. Unused in v1. */
  chars?: readonly Readonly<Record<string, unknown>>[] | null;
}
export interface AudioInput {
  /** Complete mono audio, finite PCM samples; duration derived from sample count. */
  pcm: Float32Array;
  sampleRate: 16000;
}
export interface Capabilities {
  contractVersion: 1;
  libraryVersion: string;
  supportedLanguages: readonly string[];
  model: {
    id: string;
    revision: string;
    device: "webgpu" | "wasm";
    dtype: string;
  };
  alignmentOptions: readonly ("pairing" | "threshold" | "window" | "karaoke")[];
  lyricsContext: boolean;
}
export type Progress = {
  phase: "preparing-model" | "transcribing" | "aligning";
  detail?: string;
  /** Phase-local sequence; caller attaches its own job key and sequence. */
  sequence: number;
} & (
  | { kind: "indeterminate" }
  | {
      kind: "measured";
      completed: number;
      total: number;
      unit: "bytes" | "seconds" | "items";
      /** Identifies individual downloads / processing units, not overall progress. */
      scope: string;
    }
);
export interface OperationContext {
  signal: AbortSignal;
  onProgress?: (event: Progress) => void;
}
export interface PrepareOptions {
  language?: string;
}
export interface TranscribeOptions {
  language?: string;
  /** Exact selected lyrics; interpretation / prompt construction belong to library. */
  lyricsContext?: readonly string[];
}
export interface AlignOptions {
  pairing?: number | "auto";
  threshold?: number;
  window?: number;
  karaoke?: false;
}
export type ErrorCode =
  | "UNSUPPORTED_LANGUAGE"
  | "UNSUPPORTED_DEVICE"
  | "UNSUPPORTED_OPTION"
  | "MODEL_LOAD_FAILED"
  | "INVALID_INPUT"
  | "OUT_OF_MEMORY"
  | "TRANSCRIPTION_FAILED"
  | "ALIGNMENT_FAILED"
  | "ABORTED";
/** Rejected operations expose this shape; no cross-realm instanceof required. */
export interface LibraryError {
  code: ErrorCode;
  message: string;
}
export interface LyricAlignSession {
  /** New browser integration requirement, not a Python API. */
  prepare(options: PrepareOptions, context: OperationContext): Promise<void>;
  transcribe(
    audio: AudioInput,
    options: TranscribeOptions,
    context: OperationContext,
  ): Promise<readonly Segment[]>;
  /** Output preserves input lyric count, order and exact text; seconds throughout. */
  align(
    segments: readonly Segment[],
    lyrics: readonly string[],
    options: AlignOptions,
    context: OperationContext,
  ): Promise<readonly AlignedLine[]>;
  /** Idempotent; called only after active operation settles or host is terminated. */
  dispose(): Promise<void>;
}
export interface LyricAlignBinding {
  readonly capabilities: Capabilities;
  createSession(): Promise<LyricAlignSession>;
}
