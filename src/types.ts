export interface TimelineEntry {
  text: string;
  startTime: number;
  endTime: number;
  confidence?: number;
  timeline?: TimelineEntry[];
  id?: number;
  type?: string;
}
export interface Cue {
  id: number;
  text: string;
  start: number | null;
  end: number | null;
  matched: boolean;
  issues: string[];
}
export interface Progress {
  stage: string;
  completed?: number;
  total?: number;
}
export type AudioInput = Blob | AudioBuffer | { samples: Float32Array; sampleRate: 16000 };
export interface AlignerOptions {
  /** Where parity.js, parity.wasm and tokenizer assets are hosted. */
  assetBaseUrl?: string | URL;
  /** Classic Worker entry point. Override when bundling the package into an app. */
  workerUrl?: string | URL;
  modelUrl?: string | URL;
  /** Expected SHA256; custom models must use the same tiny multilingual architecture. */
  modelSha256?: string;
  threads?: 1 | 2 | 4 | 6 | 8 | 12;
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
}
export interface AlignInput {
  audio: AudioInput;
  lyrics: string | string[];
  language: string;
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
}
export interface AlignmentMetrics {
  initializationSeconds: number;
  audioPreparationSeconds: number;
  alignmentSeconds: number;
  cueMappingSeconds: number;
  operationSeconds: number;
  engineTotalSeconds: number;
  totalSeconds: number;
}
export interface AlignmentResult {
  words: TimelineEntry[];
  cues: Cue[];
  /** Invalid/missing/zero-duration cues are omitted; inspect cues[].issues. */
  srt: string;
  audioSeconds: number;
  metrics: AlignmentMetrics;
}
export interface Aligner {
  align(input: AlignInput): Promise<AlignmentResult>;
  /** Terminates the Worker and rejects in-flight work. Safe to call repeatedly. */
  dispose(): void;
}
