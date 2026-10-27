# Personal Voice Assistant

A React Native Community CLI mobile application and a Node.js backend. Both use
TypeScript with strict type checking. Android and iOS native projects are included.

## Architecture and technology

```text
Mobile microphone
  -> native audio recorder
  -> Node.js /v1/assistant API
  -> FFmpeg normalization (16 kHz mono WAV)
  -> Groq Whisper transcription
  -> Groq chat model with recent context
  -> JSON transcript + reply
  -> mobile text-to-speech and conversation screen
```

| Layer | Technology | Purpose |
| --- | --- | --- |
| App | React Native Community CLI 0.86.2 + TypeScript | Native Android/iOS application |
| Recording | react-native-nitro-sound + react-native-nitro-modules | Record short questions in the app cache |
| Files | react-native-file-access | Read and delete temporary recordings |
| Speech playback | native Android TextToSpeech / iOS AVSpeechSynthesizer | Speak replies with installed device voices |
| Backend | Node.js + TypeScript + built-in fetch | Validate requests and call the Groq API |
| Speech recognition | Groq whisper-large-v3-turbo | Audio to text |
| Conversation | Groq openai/gpt-oss-20b | Generate concise replies |
| Audio normalization | FFmpeg on the backend | Consistent audio format for speech recognition |
| Accounts and saved memory, later | Supabase Auth + PostgreSQL | User-specific settings and history |
| Session credentials, later | react-native-keychain | Protect user session credentials on the phone |
| Reminders, later | Notifee + a validated action dispatcher | Schedule real notifications |
| Release delivery, later | Android Studio/Gradle; Xcode/CocoaPods; optional Fastlane | Build and distribute native applications |

Start with tap-to-record conversations. Always-listening wake words, background
microphone use, streaming, and offline inference each need additional native work.
A vector database and agent framework are unnecessary for this first milestone.

Keep GROQ_API_KEY exclusively on the backend. The mobile API URL and language setting
are public configuration; application bundles cannot safely hold provider secrets.

## Structure

```text
Personal Assistant/
  package.json                    # npm workspaces and common scripts
  backend/
    .env.example                  # server-only settings
    src/
      index.ts                    # configuration and startup
      server.ts                   # HTTP routes, input size bounds, concurrency
      assistant.ts                # typed validation and conversation orchestration
      groq.ts                     # multipart transcription and chat API adapters
      inference-errors.ts         # safe provider error messages
      audio.ts                    # FFmpeg conversion and temporary-file cleanup
    scripts/check-groq.ts         # optional live key/model/inference check
    test/                         # orchestration, HTTP, Groq adapter, error tests
  mobile/
    android/                      # native Gradle project and Kotlin host
    ios/                          # native Xcode project and Swift host
    index.ts                      # AppRegistry entry point
    App.tsx                       # conversation screen
    src/
      config.ts                   # backend address and device speech language
      api/assistant.ts            # typed upload/response contract and cleanup
      native/speech.ts            # typed interface to the built-in speech engines
      features/voice/
        useVoiceAssistant.ts      # permissions, recording, playback, lifecycle
```

All application logic and backend tests are TypeScript. Babel and Metro use their
standard configuration files; the platform hosts and speech adapters use Kotlin,
Swift, and Objective-C++. The speech adapters are registered in the native projects. The
Android Gradle and Metro configurations account for npm workspace dependencies.

## Run locally

For the standalone physical-phone test APK, see
[Android device testing](docs/ANDROID-DEVICE-TEST.md). That build includes the
JavaScript bundle and uses the computer's LAN address; it does not need Metro.

Install Node.js 22.13+ (a supported LTS release), then configure the native build
environment using the React Native documentation linked below. For Android you
need Android Studio, its SDK/platform tools, an appropriate JDK, and an emulator
or USB-connected phone. Use the SDK/NDK versions in android/build.gradle. For iOS
you need macOS, Xcode 26+, Ruby/Bundler, and CocoaPods. Native iOS builds cannot run
on Windows. The generated project uses React Native 0.86.2, matching the audio
library's documented verification baseline.

From this project folder:

```powershell
npm.cmd install
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
```

The example defaults to DEMO_MODE=false for real Groq inference. Add your key to
GROQ_API_KEY in backend/.env before starting the backend. A missing key produces
a startup message instead of silently using canned responses. To test the UI
without a key or FFmpeg, explicitly set DEMO_MODE=true. That mode returns fixed,
clearly labeled examples; it does not recognize recorded speech.

For Android development builds, the app defaults to http://10.0.2.2:8000. For an iOS
simulator, it defaults to http://localhost:8000. For the standalone phone-test APK,
set phoneTestBackendUrl in mobile/src/config.ts to the computer's LAN IP and set HOST=0.0.0.0
in backend/.env, and keep the phone and computer on the same trusted Wi-Fi.
Permit port 8000 on the private network if a firewall blocks it.

Start the backend in terminal 1:

```powershell
npm.cmd run backend
```

Start Metro in terminal 2:

```powershell
npm.cmd run mobile
```

Start an Android emulator or connect an Android phone with USB debugging enabled.
Build and install in terminal 3; Metro is already running:

```powershell
npm.cmd run android --workspace mobile -- --no-packager
```

On macOS, install the iOS pods before building:

```sh
cd mobile
bundle install
cd ios
bundle exec pod install
cd ../..
npm run ios --workspace mobile -- --no-packager
```

Tap **Tap to speak**, grant microphone access, ask a short question, and tap
**Stop & send**. A recording also ends and submits after 30 seconds. Moving the
app into the background cancels work and discards an active recording. The reply
appears as text even when a suitable TTS engine or language voice is missing.
Change speechLanguage in mobile/src/config.ts to select an installed language.

Android debug builds allow local HTTP through the generated build configuration.
For an iOS physical device, prefer a trusted HTTPS development endpoint; ATS can
restrict direct HTTP connections. Release builds should use an HTTPS backend.
Before distribution, configure your own application identifiers, signing, and
release credentials instead of the generated example/debug settings.

## Enable live Groq inference

1. Create one Groq account and generate an API key at https://console.groq.com/keys.
   The same key is used for transcription and chat. The free plan has request,
   token, and audio quotas; check your account's current limits.
2. Add the key after GROQ_API_KEY= in backend/.env and keep DEMO_MODE=false.
3. Keep GROQ_ASR_MODEL=whisper-large-v3-turbo and
   GROQ_CHAT_MODEL=openai/gpt-oss-20b, or choose other available Groq models.
4. Install FFmpeg or set FFMPEG_PATH to its full executable path. On this
   workspace, the existing verified FFmpeg path has been preserved in .env.
5. Stop the old backend with Ctrl+C and run npm.cmd run backend. The startup
   message should end in (Groq). Then record a short question in the app.

The backend now calls Groq directly with Node's built-in fetch and FormData;
no additional AI SDK is needed. Old HF_TOKEN/HF_* entries in an existing .env
are ignored. Your existing mobile API URL and response format still work.
Free-plan quota errors return 429 with guidance; the adapter does not retry them
automatically. A free tier is quota-limited and is not unlimited usage.

Device speech playback avoids another hosted TTS request; voice availability and
quality depend on the phone. For a consistent cloud voice, add a backend speech
endpoint using a suitable speech provider and play its audio with
the native player. Speech recognition, chat language quality, and spoken voices
must each be evaluated for your intended languages.

## API and memory

GET /health returns liveness and mode (groq or demo). It does not verify account
access, API key validity, quotas, or FFmpeg availability.

POST /v1/assistant with Content-Type: application/json:

```json
{
  "audioBase64": "BASE64_ENCODED_RECORDING",
  "history": [
    { "role": "user", "content": "My name is Sam." },
    { "role": "assistant", "content": "Hello Sam." }
  ]
}
```

Response:

```json
{
  "transcript": "What is my name?",
  "reply": "Your name is Sam.",
  "demo": false
}
```

Limits: 4 MB audio, 6 MB JSON body, 30-second decoded audio, at most four previous
conversation turns, 4000 characters per history message, 16000 history characters
total, two concurrent requests per backend process, and bounded model output.
Base64 adds about one third to the transfer size; use multipart/binary uploads
and streaming when optimizing for traffic or latency.

Chats stay in app memory and reset when a new conversation begins or the app
restarts. The app deletes temporary recordings after requests; the backend deletes
conversion files in a finally block. Live mode sends audio and recent context to
Groq. Review its data policy before sending
sensitive content.

## Personal actions and production

The included app supports conversation. It does not create reminders, read
calendars, send messages, or control phone settings. Its server prompt explicitly
describes those missing integrations.

For a future command such as “Remind me tomorrow at 9”, request a structured tool
call from the model, validate it, resolve the user's timezone and local date,
confirm the proposed action when appropriate, request the required permission,
execute a defined notification/calendar API, and return the actual tool result
to the model before claiming success. Never execute generated shell commands or
JavaScript. Email/calendar services require account integration and OAuth.

Next milestones:

1. User settings, voice selection, reminders, and calendar integration.
2. Verified user authentication and optional saved conversation/preferences.
3. Voice activity detection, streaming, and interruption of speech playback.
4. HTTPS deployment, per-user quotas, authorization, data deletion, monitoring,
   and real-device testing on both platforms.

The backend has no authentication and defaults to loopback for local development.
LAN binding is for trusted development testing. Add verified user authentication
before publicly exposing an API that spends inference credits. A static secret
inside the mobile bundle is not a substitute for user authentication.

## Validation and troubleshooting

```powershell
npm.cmd test
npm.cmd run typecheck
```

The backend tests use ASR/chat stubs. They cover orchestration, context validation,
invalid requests, empty outputs, concurrency, and the response contract. They do
not establish live-provider availability or model accuracy. Native compilation,
microphone permissions, interruption behavior, audible playback, FFmpeg conversion,
and real inference still require the appropriate SDKs, a device, and a Groq
API key. TypeScript and Metro checks do not replace a native device build.

A connection failure usually means the API address, LAN access, or firewall
needs attention. A 502 means check the API key, model availability, permissions,
or provider status. A 503 mentioning FFmpeg means its executable is not available.
A text reply without audio usually means a TTS engine or language voice must be
installed or the device's audio routing needs attention.

Provider failures now identify the failing stage (transcription or chat), HTTP
status, and a safe category without logging the token, recording, prompt, or raw
provider response. HTTP 402 means an account billing restriction needs attention;
401 means authentication, 403 means permission/access, and 429 means rate limiting.
The backend distinguishes speech recognition errors from chat generation errors.

To check the configured account and both models:

```powershell
npm.cmd run check:groq --workspace backend
```

This verifies the key and configured models, then makes real inference calls
using a short generated audio tone and a minimal chat prompt. It does not
upload user recordings, but it counts against your Groq quota. It stops after the
first failure. The tone verifies request routing, not transcription accuracy.

## Official references

- [React Native Community CLI setup](https://reactnative.dev/docs/getting-started-without-a-framework)
- [Native development environment](https://reactnative.dev/docs/set-up-your-environment)
- [Native audio recorder](https://github.com/hyochan/react-native-nitro-sound)
- [Android text-to-speech](https://developer.android.com/reference/android/speech/tts/TextToSpeech)
- [iOS speech synthesis](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer)
- [Native file access](https://github.com/alpha0010/react-native-file-access)
- [Groq API keys](https://console.groq.com/keys)
- [Groq API reference](https://console.groq.com/docs/api-reference)
- [Groq speech recognition](https://console.groq.com/docs/speech-to-text)
- [Groq models](https://console.groq.com/docs/models)
- [Groq free-plan limits](https://console.groq.com/docs/rate-limits)
- [FFmpeg downloads](https://ffmpeg.org/download.html)

