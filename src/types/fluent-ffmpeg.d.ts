declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    audioFrequency(frequency: number): FfmpegCommand;
    audioChannels(channels: number): FfmpegCommand;
    format(format: string): FfmpegCommand;
    on(event: 'end', handler: () => void): FfmpegCommand;
    on(event: 'error', handler: (error: Error) => void): FfmpegCommand;
    save(output: string): void;
  }

  export default function ffmpeg(input?: string): FfmpegCommand;
}
