# Lookout AI

Lookout is a camera-monitoring web app with low-latency face recognition through [Exadel CompreFace](https://github.com/exadel-inc/CompreFace). This repository includes a Docker Compose stack that starts Lookout and the complete self-hosted CompreFace service together.

## Start the full stack

### Prerequisites

- Docker Engine / Docker Desktop with **Docker Compose v2**
- An x86-64 CPU with AVX support for CompreFace (see the [upstream requirements](https://github.com/exadel-inc/CompreFace#requirements))
- Enough Docker memory and disk for CompreFace's ML model image; the initial image pull is large and startup can take a minute or two.

From the repository root, start everything with one command:

```bash
npm run stack:up
```

That command is a shortcut for:

```bash
docker compose up --build -d
```

It builds Lookout, starts the five upstream CompreFace components, and stores CompreFace data in the named Docker volume `lookout_compreface-postgres-data`.

Open the services after they have started:

- **Lookout:** <http://localhost:3000>
- **CompreFace setup UI:** <http://localhost:8000>

The CompreFace UI is bound to `127.0.0.1` by default, so its admin interface and biometric data are not exposed to the local network. Lookout listens on port `3000` on all interfaces by default for camera/device access. See [Configuration](#configuration) to change either binding.

## One-time CompreFace connection

CompreFace deliberately requires an administrator to create its first account and API credential. After the stack is running:

1. Open <http://localhost:8000>, sign up, and sign in.
2. Create an **Application**.
3. In that application, create a **Face Recognition Service** (not merely a Detection or Verification service).
4. Copy that service's API key.
5. Create a local configuration file and add the key:

   ```bash
   cp .env.example .env
   ```

   ```dotenv
   COMPREFACE_API_KEY=paste-the-face-recognition-service-key-here
   ```

6. Apply the configuration:

   ```bash
   docker compose up -d lookout
   ```

Lookout automatically reaches CompreFace over the private Compose network at `http://compreface-ui`; no CompreFace URL needs to be added when using the bundled stack. The Lookout recognition status endpoint reports a clear configuration error until the API key is set.

> Keep `.env` private. It is ignored by Git and should never be committed, shared, or placed in browser-side code.

## Useful commands

| Task | Command |
| --- | --- |
| Start/rebuild Lookout and CompreFace | `npm run stack:up` |
| View service status | `npm run stack:status` |
| Follow all logs | `npm run stack:logs` |
| Stop the stack, preserving face data | `npm run stack:down` |
| Stop and **permanently delete** CompreFace data | `docker compose down -v` |

For a clean first-time startup, wait until `npm run stack:status` shows the CompreFace services running before completing the setup in its UI. If a component needs troubleshooting, use `docker compose logs -f compreface-api`, `compreface-core`, or `compreface-admin`.

## Configuration

All optional settings are documented in [`.env.example`](.env.example). Docker Compose supplies sensible defaults, so only `COMPREFACE_API_KEY` is needed for face recognition.

| Variable | Default | Purpose |
| --- | --- | --- |
| `COMPREFACE_API_KEY` | empty | API key from the CompreFace **Face Recognition Service**. Required for Lookout face recognition. |
| `LOOKOUT_PORT` | `3000` | Host port for Lookout. |
| `LOOKOUT_BIND_ADDRESS` | `0.0.0.0` | Host interface on which Lookout listens. Set `127.0.0.1` to keep Lookout local. |
| `COMPREFACE_PORT` | `8000` | Host port for the CompreFace UI. |
| `COMPREFACE_BIND_ADDRESS` | `127.0.0.1` | Host interface for the CompreFace admin UI. Do not expose it publicly without access controls. |
| `COMPREFACE_POSTGRES_PASSWORD` | `postgres` | Database password for a new local CompreFace installation. Set a strong value **before the first launch**. |
| `LOOKOUT_COMPREFACE_URL` | `http://compreface-ui` | Advanced override for the CompreFace URL as seen by the Lookout container. |

The CompreFace images are pinned to upstream version `1.2.0` and follow its [official multi-service Compose architecture](https://github.com/exadel-inc/CompreFace/blob/master/docker-compose.yml). The database, API, admin, ML core, and UI remain on the internal Docker network; only the Lookout and CompreFace UI ports are published.

## Face alert notifications

Alerts never cover the live feed. When a face is detected, Lookout raises a compact card in the corner of the screen that shows:

- the cropped face that triggered the alert, taken from the camera's native pixels;
- who it is ("Brian identified"), the camera, the time, and the match confidence;
- a smooth looping GIF of the feed around the moment of the alert, encoded locally with no third-party library and saveable with one click;
- a spoken announcement through the browser's speech synthesizer, for example "Brian has been identified on Front Door, 97 percent match."

Hovering a card pauses its countdown, `Esc` clears the stack, and repeated sightings of the same subject are throttled by the alert cooldown. Everything is configurable in **Settings -> Alerts & Tones -> Face Notification Pop-ups**:

| Setting | Effect |
| --- | --- |
| Animated GIF preview | Attach a looping GIF of the live feed to each alert |
| Speak the identified name | Say the person's name, or announce "a known person" instead |
| Notification on-screen time | 3-30 seconds; critical alerts stay up longer automatically |
| Quiet hours | Keep the cards visible while muting tones and speech |
| Send a test face notification | Preview exactly how an identification looks and sounds |

## Detection sensitivities

**Settings -> AI Detection Sensitivities** drives the live pipeline directly. Nothing in that panel is decorative:

| Control | Effect |
| --- | --- |
| People & Intruders | Master gate for the face pipeline: detection confidence floor, monitored zone, consecutive-scan confirmation, identity/unknown-person alerts, and the face-triggered DVR |
| Threats & Perimeter Breach | Gates intruder-identification and rapid-approach alerts |
| Animals & Pets | Gates local pet recognition and its alerts |
| Vehicles / Objects | No detector of these kinds is bundled; the switches gate the delivery-activity notifier for vehicle- and package-like labels |
| Weather | Reserved; no bundled detector |
| Fixed camera false-positive guard | Pauses detections briefly when most of the image shifts together (fixed cameras only) |

The detection sensitivity slider maps to how many consecutive scans must confirm a face (one scan at 100%, six at the lowest setting), and the confidence slider raises the detector probability floor above the built-in 82% false-positive guard. Each category also owns its alert switch, audible chime, monitored zone, and HUD bounding-box color, and the panel shows the derived values live.

The **Face Database similarity match threshold** (85–99%) is honored across its full range: on-screen naming uses the exact value, and alert-level identification requires a small step above it — capped at the shipped 97% strictness, so raising the slider never makes alerts harder than they were before the slider was live.

**Settings -> Face Database -> Live Recognition Activity** shows, in real time, every stage a face passes or fails: how many faces were seen, how many were dropped by the confidence floor or monitored zone, how many were confirmed, named, and identified, how many scans were skipped because the scene was still, plus the exact gates in effect and any recognition request errors. It is the first place to look when someone "used to be recognized" and no longer is.

## Recognition efficiency and false-positive hardening

The live recognition cycle is tuned so that recognizer load, CPU, and false alerts stay proportional to actual activity:

- **Motion-gated sending.** A tiny 32×18 grayscale sample of the camera frame decides whether anything moved. Still scenes send nothing at all — just one heartbeat frame about every 5 seconds keeps presence tracks fresh — and real motion instantly resumes scanning at full rate (at most one frame per ~0.6 s on desktop, ~0.9 s on phones).
- **Gateway-level filtering.** The app's own confidence floor is forwarded as CompreFace's `det_prob_threshold`, so the detector never returns boxes the app would immediately discard. `status=false` keeps responses minimal and `face_plugins=landmarks` requests the 5-point landmarks.
- **Landmark geometry gate.** Detections whose landmarks show a heavy head roll (> ~20°), a hard profile turn (nose-to-eye distance ratio above ~2.2), or vertical nonsense are dropped before any identity work — off-axis faces are the classic source of wrong-name matches.
- **Minimum live face size.** Live faces below ~60 px are not trusted for recognition; small, blurry faces mismatch against crisp reference photos. Distant faces still work through the enlarged long-range tiles, where the floor applies in upscaled tile pixels (~30 px in the source frame).
- **Dual-threshold gray zone.** A match at or above the alert threshold is accepted immediately. Matches between the naming and alert thresholds are held until the same tracked face agrees on the same subject for three consecutive scans; an identity change, a score drop, or a long gap resets the streak. A second inference pass on the same frame used to guard this zone and has been removed — temporal agreement does the job without doubling request load.
- **Byte-budgeted frames.** Every image sent to CompreFace — the live snapshot and each long-range tile — is JPEG-encoded within ~100 KB (quality ladder first, then a mild downscale whose exact dimensions are reported back so box coordinates stay truthful).
- **Negative/noise profiles.** Enroll a CompreFace subject named `Background_Noise` (or `unknown_classifiers`, `negative_samples`, `do_not_match`, `ignore_face`) using photos of whatever keeps getting falsely identified — a poster, a reflection, a photo on the wall. Detections matching it are dropped entirely: no identity, no unknown-person alert, no face-album entry.
- **Reference-photo guidance.** Unknown-face album captures are padded well beyond the face box (head and shoulders, not a tight crop), and enrollment validates that reference photos are at least 200×200 px with a sane portrait shape before registering them.

## Low-CPU recognition mode

Lookout is intentionally focused on face recognition. Camera audio capture, transcription, acoustic analysis, local scene models, semantic segmentation, and general object detection are not started or bundled. The live pipeline sends at most one budget-sized JPEG (~100 KB, up to 1280 px wide) to CompreFace per scan — and none at all while the scene is still — while overlays render at 30 fps, leaving CPU time available for identity matching. The manual **CompreFace scan** retains an optional long-range tiled scan for difficult frames.

The bundled CompreFace defaults use one ML worker and reduced Java heap limits (API `-Xmx1g`, Admin `-Xmx512m`). Override `COMPREFACE_UWSGI_PROCESSES`, `COMPREFACE_API_JAVA_OPTS`, or `COMPREFACE_ADMIN_JAVA_OPTS` only on machines with more CPU and memory.

## Local development without the Lookout container

You can use the same Compose file to run just CompreFace, then develop Lookout with Vite/Express on the host:

```bash
docker compose up -d compreface-ui
cp .env.example .env
# Add COMPREFACE_API_KEY after creating the Face Recognition Service.
npm ci
npm run dev
```

For host development, Lookout defaults to `http://localhost:8000` for `COMPREFACE_URL`. Do not set `LOOKOUT_COMPREFACE_URL` unless the Dockerized Lookout service should intentionally use a different CompreFace host.

## Privacy and responsible use

Face templates, subjects, and enrolled images are biometric data. Obtain appropriate consent, secure the host and API key, restrict service access, and comply with all applicable privacy, employment, surveillance, and biometric-data laws before enrolling or identifying people.
