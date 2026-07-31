import ExpoModulesCore
import AVFoundation

/// Decodes any AVFoundation-readable compressed audio file (MP3, M4A/AAC, etc.)
/// into a PCM WAV file, using the OS's own decoder — no third-party codec
/// library involved. The output bit depth/format matches whatever
/// `AVAudioFile.processingFormat` decodes to for the source (typically
/// 32-bit float, non-interleaved); the JS-side WAV reader in
/// lib/stem-separation.ts already supports 32-bit float WAV, so no forced
/// re-encoding step is needed here.
public class AudioDecoderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioDecoder")

    AsyncFunction("decodeToWavAsync") { (sourceUri: String, destUri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let result = try AudioDecoderModule.decode(sourceUri: sourceUri, destUri: destUri)
          promise.resolve(result)
        } catch {
          promise.reject("ERR_AUDIO_DECODE", error.localizedDescription)
        }
      }
    }
  }

  private static func decode(sourceUri: String, destUri: String) throws -> String {
    let sourcePath = try fileURL(from: sourceUri)
    let destPath = try fileURL(from: destUri)

    // Ensure the destination directory exists.
    let destDir = destPath.deletingLastPathComponent()
    try? FileManager.default.createDirectory(at: destDir, withIntermediateDirectories: true)
    // AVAudioFile(forWriting:) fails if a file already exists at the destination.
    if FileManager.default.fileExists(atPath: destPath.path) {
      try? FileManager.default.removeItem(at: destPath)
    }

    let inputFile = try AVAudioFile(forReading: sourcePath)
    let format = inputFile.processingFormat

    // Re-use the exact decoded format's settings for the output file so no
    // buffer-format conversion is needed — AVAudioFile infers the container
    // (WAV) from the destination's file extension.
    let outputFile = try AVAudioFile(forWriting: destPath, settings: format.settings)

    let frameCapacity: AVAudioFrameCount = 8192
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCapacity) else {
      throw DecodeError.bufferAllocFailed
    }

    while true {
      buffer.frameLength = 0
      try inputFile.read(into: buffer, frameCount: frameCapacity)
      if buffer.frameLength == 0 { break }
      try outputFile.write(from: buffer)
    }

    return destUri
  }

  /// Accepts both `file://…` URI strings and plain filesystem paths.
  private static func fileURL(from uriString: String) throws -> URL {
    if let url = URL(string: uriString), url.isFileURL {
      return url
    }
    if uriString.hasPrefix("/") {
      return URL(fileURLWithPath: uriString)
    }
    throw DecodeError.invalidUri(uriString)
  }

  private enum DecodeError: LocalizedError {
    case invalidUri(String)
    case bufferAllocFailed

    var errorDescription: String? {
      switch self {
      case .invalidUri(let uri): return "Invalid file URI: \(uri)"
      case .bufferAllocFailed: return "Failed to allocate PCM buffer"
      }
    }
  }
}
