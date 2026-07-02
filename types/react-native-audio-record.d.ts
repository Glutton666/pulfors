declare module "react-native-audio-record" {
  interface AudioRecordOptions {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource?: number;
    wavFile?: string;
  }

  interface AudioRecordSubscription {
    remove: () => void;
  }

  const AudioRecord: {
    init(options: AudioRecordOptions): void;
    start(): void;
    stop(): Promise<string>;
    on(event: "data", callback: (data: string) => void): AudioRecordSubscription;
  };

  export default AudioRecord;
}
