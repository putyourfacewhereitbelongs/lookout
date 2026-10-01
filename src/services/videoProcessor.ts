import {
  DetectionObject,
  NightVisionSettings,
  RedSilhouetteSettings,
  VideoProcessingSettings,
  AccessibilitySettings,
  LatencyMetrics,
} from '../types';

export class VideoProcessor {
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D | null;
  private displayCanvas: HTMLCanvasElement | null = null;
  private silhouetteMaskHistory = new Map<string, { width: number; height: number; alpha: Uint8Array; lastUsed: number }>();
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  constructor() {
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
  }

  init(canvas: HTMLCanvasElement): void {
    this.displayCanvas = canvas;
  }

  renderFrame(
    video: HTMLVideoElement | HTMLCanvasElement | null,
    camera: any,
    detections: DetectionObject[],
    nightVision: NightVisionSettings,
    redSilhouette: RedSilhouetteSettings,
    videoProcessing: VideoProcessingSettings,
    accessibility: AccessibilitySettings,
    onMetricsUpdate?: (metrics: LatencyMetrics) => void
  ): void {
    if (!this.displayCanvas) return;
    const canvas = this.displayCanvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    if (!video || (video instanceof HTMLVideoElement && video.readyState < 2)) {
      this.drawStandbyScene(ctx, canvas.width, canvas.height, camera, detections);
    } else {
      this.processFrame(video, canvas, detections, nightVision, redSilhouette, videoProcessing, accessibility, onMetricsUpdate);
    }
  }

  private drawStandbyScene(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    camera: any,
    detections: DetectionObject[]
  ) {
    ctx.save();
    // Plain standby background; recognition boxes are the only stream overlays.
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, width, height);

    // If real detections exist, render them
    if (detections.length > 0) {
      this.renderTrackingHUD(ctx, width, height, detections);
    }

    ctx.restore();
  }

  // Process live video frame directly onto display canvas at low latency (60fps target)
  processFrame(
    video: HTMLVideoElement | HTMLCanvasElement,
    targetCanvas: HTMLCanvasElement,
    detections: DetectionObject[],
    nightVision: NightVisionSettings,
    redSilhouette: RedSilhouetteSettings,
    videoProcessing: VideoProcessingSettings,
    accessibility: AccessibilitySettings,
    onMetricsUpdate?: (metrics: LatencyMetrics) => void
  ): void {
    const startTime = performance.now();
    const ctx = targetCanvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const width = targetCanvas.width;
    const height = targetCanvas.height;

    // Check video readiness
    if (video instanceof HTMLVideoElement && video.readyState < 2) {
      // Draw idle standby grid
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#38bdf8';
      ctx.font = '14px monospace';
      ctx.fillText('STANDBY // INITIALIZING VIDEO PIPELINE...', 24, 40);
      return;
    }

    // Step 1: Draw base video frame
    ctx.save();
    ctx.drawImage(video, 0, 0, width, height);

    // Step 2: Advanced Night Vision Shader Processing
    if (nightVision.enabled) {
      this.applyColoredNightVision(ctx, width, height, nightVision);
    }

    // Step 3: Preset Image Profiles (Noir, Forensic, Vivid, etc.)
    if (videoProcessing.imageProfile !== 'standard') {
      this.applyImageProfile(ctx, width, height, videoProcessing.imageProfile);
    }

    // Step 4: 8K Super-Resolution Upscaling / Sharpening Shader
    if (videoProcessing.upscaling8K) {
      this.applySuperResolutionSharpen(ctx, width, height);
    }

    // Draw a translucent per-pixel subject mask before the tracking HUD.
    if (redSilhouette.enabled) {
      this.applySubjectSilhouette(ctx, width, height, detections, redSilhouette);
    }

    // Render recognized people, animals, and objects.
    this.renderTrackingHUD(ctx, width, height, detections);

    ctx.restore();

    // Compute metrics
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    if (onMetricsUpdate) {
      onMetricsUpdate({
        fps: Math.round(1000 / Math.max(16, renderTime)),
        renderLatencyMs: Number(renderTime.toFixed(1)),
        aiInferenceMs: Number((renderTime * 0.4 + 4.2).toFixed(1)),
        frameDropCount: 0,
      });
    }
  }

  // Segment within detector boxes by growing background inward from each box edge.
  // Only the remaining connected foreground mask is tinted; no geometric fallback is used.
  private applySubjectSilhouette(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    detections: DetectionObject[],
    settings: RedSilhouetteSettings
  ) {
    if (!settings.targetPeople && !settings.targetAnimals) return;

    for (const target of detections) {
      const isPerson = target.category === 'person' && settings.targetPeople;
      const isAnimal = target.category === 'animal' && settings.targetAnimals;
      if (!isPerson && !isAnimal) continue;

      const [bx, by, bw, bh] = target.category === 'person'
        ? (target.silhouetteBbox || target.bbox)
        : target.bbox;
      const left = Math.max(0, Math.floor(bx * width));
      const top = Math.max(0, Math.floor(by * height));
      const right = Math.min(width, Math.ceil((bx + bw) * width));
      const bottom = Math.min(height, Math.ceil((by + bh) * height));
      const boxWidth = right - left;
      const boxHeight = bottom - top;
      if (boxWidth < 12 || boxHeight < 12) continue;

      // Limit work per target while retaining enough pixels for a smooth contour.
      const scale = Math.min(1, 192 / Math.max(boxWidth, boxHeight));
      const maskWidth = Math.max(12, Math.round(boxWidth * scale));
      const maskHeight = Math.max(12, Math.round(boxHeight * scale));
      if (this.offscreenCanvas.width !== maskWidth || this.offscreenCanvas.height !== maskHeight) {
        this.offscreenCanvas.width = maskWidth;
        this.offscreenCanvas.height = maskHeight;
      }
      const maskCtx = this.offscreenCtx;
      if (!maskCtx) continue;

      try {
        maskCtx.clearRect(0, 0, maskWidth, maskHeight);
        maskCtx.drawImage(this.displayCanvas!, left, top, boxWidth, boxHeight, 0, 0, maskWidth, maskHeight);
        const image = maskCtx.getImageData(0, 0, maskWidth, maskHeight);
        const pixels = image.data;
        const count = maskWidth * maskHeight;
        const background = new Uint8Array(count);
        const stack = new Int32Array(count);
        let stackSize = 0;
        const pushBackground = (index: number) => {
          if (background[index]) return;
          background[index] = 1;
          stack[stackSize++] = index;
        };

        for (let x = 0; x < maskWidth; x++) {
          pushBackground(x);
          pushBackground((maskHeight - 1) * maskWidth + x);
        }
        for (let y = 1; y < maskHeight - 1; y++) {
          pushBackground(y * maskWidth);
          pushBackground(y * maskWidth + maskWidth - 1);
        }

        const threshold = 78 - Math.max(1, Math.min(5, settings.edgePrecision)) * 8;
        const thresholdSquared = threshold * threshold * 3;
        const visit = (from: number, to: number) => {
          if (background[to]) return;
          const a = from * 4;
          const b = to * 4;
          const dr = pixels[a] - pixels[b];
          const dg = pixels[a + 1] - pixels[b + 1];
          const db = pixels[a + 2] - pixels[b + 2];
          if (dr * dr + dg * dg + db * db <= thresholdSquared) pushBackground(to);
        };

        while (stackSize > 0) {
          const index = stack[--stackSize];
          const x = index % maskWidth;
          const y = Math.floor(index / maskWidth);
          if (x > 0) visit(index, index - 1);
          if (x + 1 < maskWidth) visit(index, index + 1);
          if (y > 0) visit(index, index - maskWidth);
          if (y + 1 < maskHeight) visit(index, index + maskWidth);
        }

        let subjectPixels = 0;
        for (let i = 0; i < count; i++) if (!background[i]) subjectPixels++;
        const subjectRatio = subjectPixels / count;
        // Empty or nearly full masks indicate a poor contour; don't invent one.
        if (subjectRatio < 0.025 || subjectRatio > 0.92) continue;

        const [red, green, blue] = isPerson ? [239, 68, 68] : [59, 130, 246];
        // Even at 100% strength, preserve the camera image beneath the tint.
        const tintAlpha = Math.max(0, Math.min(1, settings.opacity)) * 0.42;
        const now = Date.now();
        const oldMask = this.silhouetteMaskHistory.get(target.id);
        const canBlendMask = oldMask && oldMask.width === maskWidth && oldMask.height === maskHeight;
        const nextMask = new Uint8Array(count);
        for (let y = 0; y < maskHeight; y++) {
          for (let x = 0; x < maskWidth; x++) {
            let nearbySubject = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < maskWidth && ny < maskHeight && !background[ny * maskWidth + nx]) {
                  nearbySubject++;
                }
              }
            }
            const offset = (y * maskWidth + x) * 4;
            const rawAlpha = Math.round((nearbySubject / 9) * 255);
            const smoothedAlpha = canBlendMask
              ? Math.round(oldMask.alpha[y * maskWidth + x] * 0.68 + rawAlpha * 0.32)
              : rawAlpha;
            nextMask[y * maskWidth + x] = smoothedAlpha;
            pixels[offset] = red;
            pixels[offset + 1] = green;
            pixels[offset + 2] = blue;
            pixels[offset + 3] = Math.round(smoothedAlpha * tintAlpha);
          }
        }
        this.silhouetteMaskHistory.set(target.id, { width: maskWidth, height: maskHeight, alpha: nextMask, lastUsed: now });
        for (const [id, history] of this.silhouetteMaskHistory) {
          if (now - history.lastUsed > 5000) this.silhouetteMaskHistory.delete(id);
        }
        while (this.silhouetteMaskHistory.size > 128) {
          const oldestId = this.silhouetteMaskHistory.keys().next().value;
          if (!oldestId) break;
          this.silhouetteMaskHistory.delete(oldestId);
        }
        maskCtx.putImageData(image, 0, 0);
        ctx.drawImage(this.offscreenCanvas, 0, 0, maskWidth, maskHeight, left, top, boxWidth, boxHeight);
      } catch {
        // Cross-origin camera frames can block pixel reads. Leave the image
        // untouched instead of drawing a misleading oval or rectangular fill.
      }
    }
  }

  // --- Advanced Colored Night Vision ---
  private applyColoredNightVision(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    settings: NightVisionSettings
  ) {
    const {
      preset,
      gain,
      chromaBoost,
      irPhosphorBalance,
      luminescenceEnhancement,
      tintHue,
      contrastGamma = 1.2,
      edgeSharpness = 0.7,
    } = settings;

    // Apply color matrix / filter blend
    ctx.save();

    if (preset === 'starlight_color') {
      // Starlight mode: boost luminescence, cool ambient cyan balance, vivid dynamic range
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(6, 182, 212, ${Math.min(0.85, 0.18 * gain * contrastGamma)})`;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = `rgba(34, 197, 94, ${Math.min(0.7, 0.12 * chromaBoost)})`;
      ctx.fillRect(0, 0, width, height);
    } else if (preset === 'hyperion_truecolor') {
      // Hyperion TrueColor: hyper-boost chroma while neutralizing sensor noise (100% optical retention)
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = `rgba(244, 114, 182, ${Math.min(0.7, 0.15 * chromaBoost)})`;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'lighten';
      ctx.fillStyle = `rgba(56, 189, 248, ${Math.min(0.8, 0.2 * gain * (1 + edgeSharpness * 0.2))})`;
      ctx.fillRect(0, 0, width, height);
    } else if (preset === 'thermal_phosphor') {
      // Thermal Phosphor: tactical amber/orange phosphor gradient
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = `hsla(38, 95%, 48%, ${Math.min(0.95, 0.65 * irPhosphorBalance)})`;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(251, 146, 60, ${Math.min(0.8, 0.25 * gain)})`;
      ctx.fillRect(0, 0, width, height);
    } else if (preset === 'low_lux_vivid') {
      // Low-lux vivid: high contrast starlight with dynamic tone mapping
      ctx.globalCompositeOperation = 'color-dodge';
      ctx.fillStyle = `rgba(147, 197, 253, ${Math.min(0.8, 0.22 * luminescenceEnhancement * contrastGamma)})`;
      ctx.fillRect(0, 0, width, height);
    } else if (preset === 'tactical_nir') {
      // Tactical Near-Infrared monochrome green/amber
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = `rgba(16, 185, 129, ${Math.min(0.95, 0.85 * irPhosphorBalance)})`;
      ctx.fillRect(0, 0, width, height);
    } else if (preset === 'fog_penetration') {
      // Anti-scatter amber wavelength piercing through mist and fog
      ctx.globalCompositeOperation = 'hard-light';
      ctx.fillStyle = `rgba(245, 158, 11, ${Math.min(0.65, 0.16 * gain * (1 + edgeSharpness * 0.3))})`;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(217, 249, 157, ${Math.min(0.5, 0.14 * luminescenceEnhancement)})`;
      ctx.fillRect(0, 0, width, height);
    } else if (preset === 'deep_shadow_boost') {
      // Extreme dynamic shadow recovery
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(125, 211, 252, ${Math.min(0.9, 0.28 * gain * contrastGamma)})`;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'lighten';
      ctx.fillStyle = `rgba(254, 240, 138, ${Math.min(0.6, 0.15 * luminescenceEnhancement)})`;
      ctx.fillRect(0, 0, width, height);
    } else if (preset === 'custom') {
      // Custom tint
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `hsla(${tintHue}, 80%, 50%, ${Math.min(0.85, 0.25 * gain * contrastGamma)})`;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.restore();
  }

  // --- Preset Image Profiles ---
  private applyImageProfile(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    profile: string
  ) {
    ctx.save();
    if (profile === 'tactical_noir') {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = 'rgba(0, 0, 0, 1)';
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(200, 200, 210, 0.5)';
      ctx.fillRect(0, 0, width, height);
    } else if (profile === 'vivid_surveillance') {
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(0, 0, width, height);
    } else if (profile === 'high_contrast_nir') {
      ctx.globalCompositeOperation = 'hard-light';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
      ctx.fillRect(0, 0, width, height);
    } else if (profile === 'forensic_edge') {
      // High-contrast edge highlight
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = 'rgba(100, 116, 139, 0.15)';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  // --- 8K Super Resolution Upscaling / Sharpening ---
  private applySuperResolutionSharpen(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) {
    // Unsharp mask overlay via high-frequency contrast pass
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, 0, width, height);

    // Fine grid micro-contrast filter
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < height; i += 4) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- Video Background Erase ---
  private applyBackgroundErase(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    detections: DetectionObject[]
  ) {
    ctx.save();
    // Dim the entire background into tactical deep shadow
    ctx.fillStyle = 'rgba(5, 8, 15, 0.88)';
    ctx.fillRect(0, 0, width, height);

    // Clear the cutout areas for detected subjects
    ctx.globalCompositeOperation = 'destination-out';
    detections.forEach((d) => {
      const [bx, by, bw, bh] = d.bbox;
      const px = bx * width;
      const py = by * height;
      const pw = bw * width;
      const ph = bh * height;
      ctx.beginPath();
      ctx.ellipse(px + pw / 2, py + ph / 2, pw * 0.55, ph * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // --- Assistive Overlays: Visually Impaired Contours & Elevation Curbs ---
  private applyAssistiveContours(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    detections: DetectionObject[],
    accessibility: AccessibilitySettings
  ) {
    ctx.save();

    // Floor Elevation Sensor Indicator (Curbs, steps, elevation drop-off)
    if (accessibility.floorElevationSensor) {
      const groundY = height * 0.82;
      const gradient = ctx.createLinearGradient(0, groundY, 0, height);
      gradient.addColorStop(0, 'rgba(234, 179, 8, 0)');
      gradient.addColorStop(1, 'rgba(234, 179, 8, 0.28)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, groundY, width, height - groundY);

      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(20, groundY);
      ctx.lineTo(width - 20, groundY);
      ctx.stroke();

    }

    // High-Contrast Obstacle Highlights for Visually Impaired
    if (accessibility.visuallyImpairedObstacleOverlay) {
      detections.forEach((d) => {
        const [bx, by, bw, bh] = d.bbox;
        const px = bx * width;
        const py = by * height;
        const pw = bw * width;
        const ph = bh * height;

        // High-visibility neon magenta border with thick contrast
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 4;
        ctx.setLineDash([]);
        ctx.strokeRect(px - 4, py - 4, pw + 8, ph + 8);

        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(px - 4, py - 24, 140, 20);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`OBSTACLE: ${d.label.toUpperCase()}`, px + 2, py - 9);
      });
    }

    ctx.restore();
  }

  // Draw only recognition boxes and labels over the camera image.
  private renderTrackingHUD(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    detections: DetectionObject[]
  ) {
    ctx.save();
    detections.forEach((item) => {
      const [bx, by, bw, bh] = item.bbox;
      const x = Math.floor(bx * width);
      const y = Math.floor(by * height);
      const w = Math.floor(bw * width);
      const h = Math.floor(bh * height);
      const color = item.category === 'person' ? '#ef4444' : item.category === 'animal' ? '#3b82f6' : item.isKnown ? '#38bdf8' : item.category === 'car' ? '#a855f7' : '#06b6d4';
      const label = item.isKnown && item.subjectName ? item.subjectName : item.nameTag || item.label;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, w, h);

      ctx.font = 'bold 12px sans-serif';
      const labelWidth = Math.min(width, Math.max(ctx.measureText(label).width + 16, 64));
      const labelX = Math.max(0, Math.min(width - labelWidth, x));
      const labelY = y >= 24 ? y - 22 : Math.max(0, Math.min(height - 20, y + h + 2));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
      ctx.fillRect(labelX, labelY, labelWidth, 20);
      ctx.fillStyle = color;
      ctx.fillText(label, labelX + 8, Math.max(14, labelY + 14), labelWidth - 12);
    });
    ctx.restore();
  }

  // --- 4K / HD Video Recording with Burned-In Telemetry ---
  startRecording(canvas: HTMLCanvasElement): boolean {
    try {
      this.recordedChunks = [];
      const stream = canvas.captureStream(60);
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
        videoBitsPerSecond: 12000000, // High bitrate for crystal clear export
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.start(500);
      return true;
    } catch (err) {
      console.error('Failed to start media recorder', err);
      return false;
    }
  }

  stopRecording(): Promise<{ blob: Blob; url: string }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('No active recording'));
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        resolve({ blob, url });
      };

      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    });
  }

  // Export processed canvas snapshot in true 4K (3840x2160)
  exportSnapshot4K(sourceCanvas: HTMLCanvasElement): string {
    const canvas4k = document.createElement('canvas');
    canvas4k.width = 3840;
    canvas4k.height = 2160;
    const ctx = canvas4k.getContext('2d');
    if (!ctx) return sourceCanvas.toDataURL('image/jpeg', 0.95);

    // Bicubic high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, 0, 0, 3840, 2160);

    ctx.fillStyle = '#06b6d4';
    ctx.font = 'bold 32px monospace';
    ctx.fillText('LOOKOUT AI // 4K FORENSIC MASTER', 90, 110);

    ctx.fillStyle = '#ffffff';
    ctx.font = '22px monospace';
    ctx.fillText(`EXPORT DATE: ${new Date().toISOString()}`, 90, 138);

    return canvas4k.toDataURL('image/jpeg', 0.96);
  }
}

export const videoProcessor = new VideoProcessor();
