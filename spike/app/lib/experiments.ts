// Throwaway controls for the pinned Whisper implementation; not product defaults.
export const EXPERIMENTS = [
  {
    id: "single445",
    chunk_length_s: 30,
    stride_length_s: 5,
    max_new_tokens: 445,
    no_repeat_ngram_size: 0,
  },
  {
    id: "single128",
    chunk_length_s: 30,
    stride_length_s: 5,
    max_new_tokens: 128,
    no_repeat_ngram_size: 0,
  },
  {
    id: "single128-repeat4",
    chunk_length_s: 30,
    stride_length_s: 5,
    max_new_tokens: 128,
    no_repeat_ngram_size: 4,
  },
  {
    id: "short15-128",
    chunk_length_s: 15,
    stride_length_s: 2.5,
    max_new_tokens: 128,
    no_repeat_ngram_size: 0,
  },
  {
    id: "short15-128-repeat4",
    chunk_length_s: 15,
    stride_length_s: 2.5,
    max_new_tokens: 128,
    no_repeat_ngram_size: 4,
  },
] as const;
