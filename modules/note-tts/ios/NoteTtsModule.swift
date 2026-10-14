import AVFoundation
import ExpoModulesCore

public final class NoteTtsModule: Module {
  private let synthesizer = AVSpeechSynthesizer()
  private final class Job {
    let id: String
    let url: URL
    let promise: Promise
    var file: AVAudioFile?
    var frames: AVAudioFramePosition = 0
    var sampleRate: Double = 0
    var timeout: DispatchWorkItem?
    init(id: String, url: URL, promise: Promise) {
      self.id = id; self.url = url; self.promise = promise
    }
  }
  private var active: Job?
  /** Completed outputs stay hidden from cleanup until JS claims or discards them. */
  private var unclaimedFiles = Set<URL>()

  public func definition() -> ModuleDefinition {
    Name("NoteTts")
    AsyncFunction("getVoices") { (promise: Promise) in
      promise.resolve(self.voices().map { voice in
        ["id": voice.identifier, "name": voice.name, "language": voice.language,
         "gender": voice.gender == .male ? "male" : voice.gender == .female ? "female" : "unknown"]
      })
    }.runOnQueue(.main)
    AsyncFunction("getOfflineKoreanCountVoices") { (promise: Promise) in
      promise.resolve(self.voices().filter { !$0.requiresNetworkConnection }.compactMap { voice in
        let gender = voice.gender == .male ? "male" : voice.gender == .female ? "female" : nil
        guard let gender else { return nil }
        return ["id": voice.identifier, "name": voice.name, "language": voice.language, "gender": gender]
      })
    }.runOnQueue(.main)
    AsyncFunction("generate") { (text: String, voiceId: String, requestId: String, promise: Promise) in
      self.generate(text: text, voiceId: voiceId, requestId: requestId, promise: promise)
    }.runOnQueue(.main)
    AsyncFunction("claim") { (uri: String, promise: Promise) in
      if let url = self.generatedFile(uri) { self.unclaimedFiles.remove(url) }
      promise.resolve(nil)
    }.runOnQueue(.main)
    AsyncFunction("cancel") { (requestId: String, promise: Promise) in
      if self.active?.id == requestId { self.fail("cancelled", "Speech generation cancelled.") }
      promise.resolve(nil)
    }.runOnQueue(.main)
    AsyncFunction("discard") { (uri: String, promise: Promise) in
      if let url = self.generatedFile(uri), self.active?.url.standardizedFileURL != url {
        self.unclaimedFiles.remove(url)
        try? FileManager.default.removeItem(at: url)
      }
      promise.resolve(nil)
    }.runOnQueue(.main)
    AsyncFunction("listFiles") { (promise: Promise) in
      do {
        let directory = try self.directory()
        let activeURL = self.active?.url.standardizedFileURL
        let files = try FileManager.default.contentsOfDirectory(
          at: directory, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles]
        ).filter { url in
          let isRegularFile = (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true
          return isRegularFile &&
            url.pathExtension == "wav" &&
            UUID(uuidString: url.deletingPathExtension().lastPathComponent) != nil &&
            url.standardizedFileURL != activeURL &&
            !self.unclaimedFiles.contains(url.standardizedFileURL)
        }.map(\.absoluteString)
        promise.resolve(files)
      } catch {
        promise.reject("failed", "Cannot list speech files.", error)
      }
    }.runOnQueue(.main)
    OnDestroy {
      DispatchQueue.main.async { self.fail("cancelled", "Speech module closed.") }
    }
  }

  private func voices() -> [AVSpeechSynthesisVoice] {
    AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("ko") }
  }

  private func directory() throws -> URL {
    let root = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask,
                                          appropriateFor: nil, create: true)
    let url = root.appendingPathComponent("tts-samples", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  private func generatedFile(_ uri: String) -> URL? {
    guard let url = URL(string: uri), url.isFileURL,
          let directory = try? directory(),
          url.deletingLastPathComponent().standardizedFileURL == directory.standardizedFileURL,
          url.pathExtension == "wav",
          UUID(uuidString: url.deletingPathExtension().lastPathComponent) != nil else {
      return nil
    }
    return url.standardizedFileURL
  }

  private func generate(text: String, voiceId: String, requestId: String, promise: Promise) {
    guard active == nil else { promise.reject("busy", "Speech generation is already active."); return }
    let cleanText = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleanText.isEmpty, text.utf16.count <= 300, requestId.count <= 100 else {
      promise.reject("invalidText", "Enter up to 300 characters."); return
    }
    guard let voice = voices().first(where: { $0.identifier == voiceId && !$0.requiresNetworkConnection }) else {
      promise.reject("noVoice", "Install the selected Korean voice in device settings."); return
    }
    do {
      let url = try directory().appendingPathComponent("\(UUID().uuidString).wav")
      let job = Job(id: requestId, url: url, promise: promise)
      active = job
      let timeout = DispatchWorkItem { [weak self] in
        guard self?.active === job else { return }
        self?.fail("timeout", "Speech generation timed out.")
      }
      job.timeout = timeout
      DispatchQueue.main.asyncAfter(deadline: .now() + 45, execute: timeout)
      let utterance = AVSpeechUtterance(string: cleanText)
      utterance.voice = voice
      utterance.rate = AVSpeechUtteranceDefaultSpeechRate
      utterance.pitchMultiplier = 1
      synthesizer.write(utterance) { [weak self] buffer in
        DispatchQueue.main.async {
          guard let self = self, self.active === job else { return }
          guard let pcm = buffer as? AVAudioPCMBuffer else {
            self.fail("failed", "Invalid speech audio."); return
          }
          do {
            if pcm.frameLength == 0 {
              let duration = job.sampleRate > 0 ? Double(job.frames) / job.sampleRate : 0
              job.file = nil // Close and finalize WAV before exposing its URI.
              let bytes = (try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0
              guard duration > 0, duration <= 30, bytes > 44, bytes <= 16 * 1024 * 1024 else {
                self.fail("tooLarge", "Invalid or overlong speech output."); return
              }
              job.timeout?.cancel()
              self.active = nil
              self.unclaimedFiles.insert(url.standardizedFileURL)
              promise.resolve(["uri": url.absoluteString, "duration": duration])
              return
            }
            if job.file == nil {
              job.sampleRate = pcm.format.sampleRate
              let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: pcm.format.sampleRate,
                AVNumberOfChannelsKey: pcm.format.channelCount,
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false,
                AVLinearPCMIsBigEndianKey: false,
                AVLinearPCMIsNonInterleaved: false
              ]
              job.file = try AVAudioFile(forWriting: url, settings: settings,
                                         commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved)
            }
            job.frames += AVAudioFramePosition(pcm.frameLength)
            guard job.sampleRate > 0, Double(job.frames) / job.sampleRate <= 30,
                  Double(job.frames) * Double(pcm.format.channelCount) * 4 <= 16 * 1024 * 1024 else {
              self.fail("tooLarge", "Speech output exceeds 30 seconds."); return
            }
            try job.file?.write(from: pcm)
          } catch { self.fail("failed", "Cannot write speech audio.") }
        }
      }
    } catch { promise.reject("failed", "Cannot create a speech file.") }
  }

  private func fail(_ code: String, _ message: String) {
    guard let job = active else { return }
    active = nil
    job.timeout?.cancel()
    synthesizer.stopSpeaking(at: .immediate)
    job.file = nil
    try? FileManager.default.removeItem(at: job.url)
    job.promise.reject(code, message)
  }
}
