Pod::Spec.new do |s|
  s.name = 'NoteTts'
  s.version = '0.1.0'
  s.summary = 'Device-local speech file synthesis for practice samples.'
  s.description = 'File-only Korean speech synthesis using installed system voices.'
  s.author = 'PulFors'
  s.homepage = 'https://github.com/expo/expo'
  s.license = { :type => 'MIT' }
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
