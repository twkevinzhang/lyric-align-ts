import type { AudioInfo } from "./workflow";
export async function decodeAudio(
  bytes: ArrayBuffer,
  name: string,
): Promise<{ mono: Float32Array; info: AudioInfo }> {
  const started = performance.now();
  const context = new AudioContext({ sampleRate: 16000 });
  try {
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    // decodeAudioData consumes its buffer; keep the original for local playback.
    const buffer = await context.decodeAudioData(bytes.slice(0));
    if (buffer.sampleRate !== 16000)
      throw new Error(`預期 16000 Hz，實際 ${buffer.sampleRate} Hz。`);
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < mono.length; i++)
        mono[i] += channel[i] / buffer.numberOfChannels;
    }
    return {
      mono,
      info: {
        name,
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        samples: mono.length,
        sha256: Array.from(new Uint8Array(hash), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
        decodeMs: performance.now() - started,
      },
    };
  } finally {
    await context.close();
  }
}
