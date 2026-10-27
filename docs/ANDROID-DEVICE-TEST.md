# Test APK on a physical Android phone

The standalone `deviceTest` build bundles the app's JavaScript and uses the
Android debug signing key for local testing. It installs as **Voice Assistant
Test** (`com.personalvoiceassistant.test`), separate from the development app.
It does not require Metro to run. The test APK includes ARM64 and ARMv7 libraries.

## Start the backend

The phone-test build connects to **http://192.168.1.9:8000**. Keep the computer
and phone on the same Wi-Fi. The computer must remain awake with the backend
running and have internet access for Groq.

`backend/.env` has been configured with `HOST=0.0.0.0`. After adding the Groq key,
stop any old backend process with Ctrl+C and restart it from the project folder:

```powershell
npm.cmd run backend
```

The console should show `http://0.0.0.0:8000 (Groq)`. On the phone, visit
`http://192.168.1.9:8000/health` in a browser. A reachable live backend returns:

```json
{"status":"ok","mode":"groq"}
```

The backend prints one line per request (for example
`192.168.1.23 GET /health -> 200`). If the phone tries to connect and no line
appears, the request never reached the computer.

### Allow the phone through Windows Firewall

This is the usual reason the phone gets no response. Windows blocks incoming
connections to Node.js unless a firewall rule allows them, and if the Wi-Fi is
marked as a **Public** network, a rule created for Private networks does not
apply. Fix it once, either way:

- Mark your home Wi-Fi as Private: Settings > Network & internet > Wi-Fi >
  (your network) > Network profile type > **Private network**. Then allow
  Node.js when Windows asks, or add the rule below.
- Or add a rule for port 8000 from an **administrator** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Personal Assistant backend (8000)" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private,Public
```

Then open `http://192.168.1.9:8000/health` in the phone's browser again.

Other causes: the IP changed (the backend prints the current "Phone URL" at
startup), the phone is on a different or guest Wi-Fi with client isolation, or
`HOST` is still `127.0.0.1`. The health check confirms connectivity, not Groq
key validity or inference quota.

## Install and try the APK

1. Transfer `dist/PersonalVoiceAssistant-test.apk` to the phone.
2. Open it and allow installation from that source when Android prompts.
3. Open **Voice Assistant Test** and allow microphone access.
4. Check the status pill in the top-right corner says **Online**. If it says
   **Offline**, tap it to change the server address or test the connection.
   The address is saved on the phone, so an IP change no longer needs a rebuild.
5. Tap the microphone, ask a question, then tap it again to send.

Phone speech playback needs an installed text-to-speech engine and an English
voice for the default `en-US` setting. Groq keys stay on the backend; they are
not included in the APK. This APK connects to the local computer, so it will not
reach the backend when the phone is away from that network.

## Rebuild after changes

The phone-test address lives in `mobile/src/config.ts`. Development builds still
use the emulator address. Change the phone-test address and rebuild if the
computer's Wi-Fi IP changes. The `deviceTest` variant permits local HTTP;
the normal release variant retains its transport settings.

On this Windows machine:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
$env:ANDROID_HOME = 'C:\Users\dell\AppData\Local\Android\Sdk'
Set-Location mobile/android
.\gradlew.bat :app:assembleDeviceTest '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a'
```

The native build output is
`mobile/android/app/build/outputs/apk/deviceTest/app-deviceTest.apk`.
Copy it to the `dist/` delivery path after a successful build. This is a locally
signed test artifact; use your own release signing and deployed HTTPS backend
for store distribution.

## Shopping assistant

Ask things like "I want to buy a laptop for programming under 1000 dollars".
The assistant searches real stores, shows numbered product cards (price, store,
rating, **Best price** and **Top rated** badges) and recommends one out loud.
Follow up with "which is better for gaming?" or "buy the second one".

Buying always asks you to confirm, then opens that store's page in the browser
where you check the details and pay yourself. The app never stores card details
or places orders on its own.

Where products come from: with `SHOPPING_COUNTRY=pk` the backend searches
**Daraz.pk** (prices in Rs; no key needed). Google Shopping does not support
Pakistan. For other countries it uses SerpApi Google Shopping, which needs
`SERPAPI_KEY` in `backend/.env`. The startup log shows which source is on.
To check the AI side without using search credits, run
`node --env-file=.env --import tsx scripts/check-shopping.ts` from `backend/`.

## Chat and expense tracker

Type in the message box instead of speaking if you prefer. Typed replies are
shown but not read aloud.

The **Expenses** tab shows this month's total, a breakdown by category, and your
history by day. Tap an entry for its details (store, date, link) or to delete
it. Expenses get added three ways:

- After you visit a store from the assistant and come back to the app, it asks
  "Did you buy it?". Tapping **Yes** saves the product, price and store.
- Say or type things like "I spent 2,500 on groceries".
- Tap **+** on the Expenses tab.

Ask "How much did I spend this month?" and the assistant answers from your list.
Expenses are stored only on the phone, so uninstalling the app deletes them.
