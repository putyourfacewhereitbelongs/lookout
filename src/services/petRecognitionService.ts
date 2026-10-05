import { FaceProfile } from '../types';

export interface PetMatch {
  profile: FaceProfile;
  similarity: number;
}

/**
 * Local pet recognition companion. It compares a small visual signature of the
 * detected animal face against enrolled local reference photos. No animal image
 * leaves the browser, and the algorithm remains useful when CompreFace is only
 * configured for human faces.
 *
 * The signature is a coarse colour heuristic, so on its own a single match is
 * not trustworthy: an unrecognized human can score highly against a pet photo.
 * Callers must therefore combine `match()` with `PetMatchConfirmer`, which only
 * accepts a name after two consecutive scans agreed on it.
 */
class PetRecognitionService {
  async match(imageData: string, profiles: FaceProfile[], threshold = 0.85): Promise<PetMatch | null> {
    if (!imageData || typeof document === 'undefined') return null;
    const animalProfiles = profiles.filter((profile) =>
      profile.subjectType === 'animal' && profile.role !== 'unknown' && profile.snapshots.some(Boolean)
    );
    if (!animalProfiles.length) return null;

    const target = await this.signature(imageData);
    if (!target) return null;
    const matches = await Promise.all(animalProfiles.map(async (profile) => {
      const references = await Promise.all(profile.snapshots.filter(Boolean).map((snapshot) => this.signature(snapshot)));
      const similarity = Math.max(0, ...references.filter(Boolean).map((reference) => this.compare(target, reference!)));
      return { profile, similarity };
    }));
    const best = matches.sort((a, b) => b.similarity - a.similarity)[0];
    return best && best.similarity >= threshold ? best : null;
  }

  private async signature(source: string): Promise<number[] | null> {
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        // Reference photos frequently live on remote origins; without opting
        // into CORS the canvas would be tainted and every read would throw.
        element.crossOrigin = 'anonymous';
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = source;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 12;
      canvas.height = 12;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(image, 0, 0, 12, 12);
      const pixels = context.getImageData(0, 0, 12, 12).data;
      const signature: number[] = [];
      for (let index = 0; index < pixels.length; index += 4) {
        signature.push(pixels[index] / 255, pixels[index + 1] / 255, pixels[index + 2] / 255);
      }
      return signature;
    } catch {
      return null;
    }
  }

  private compare(left: number[], right: number[]): number {
    if (left.length !== right.length || !left.length) return 0;
    let error = 0;
    for (let index = 0; index < left.length; index++) error += (left[index] - right[index]) ** 2;
    return Math.max(0, 1 - Math.sqrt(error / left.length));
  }
}

/**
 * Requires two agreeing scans before a local pet-photo match is reported.
 * The colour-signature matcher is weak, so a single hit — including a human
 * face that merely shares the pet's tones — must never label or announce a
 * subject. A disagreement or an expired window resets that track.
 */
export class PetMatchConfirmer {
  private lastMatches = new Map<string, { name: string; at: number }>();

  constructor(private readonly corroborationWindowMs = 12_000) {}

  /**
   * Feed the latest match for one detection track (keyed by its position
   * cell). Returns the match only once the same profile has been seen in two
   * successive scans inside the corroboration window.
   */
  confirm(trackKey: string, match: PetMatch | null, now = Date.now()): PetMatch | null {
    if (!match) {
      this.lastMatches.delete(trackKey);
      return null;
    }
    const previous = this.lastMatches.get(trackKey);
    this.lastMatches.set(trackKey, { name: match.profile.name, at: now });
    if (previous && previous.name === match.profile.name && now - previous.at <= this.corroborationWindowMs) {
      return match;
    }
    return null;
  }

  reset(): void {
    this.lastMatches.clear();
  }
}

export const petRecognitionService = new PetRecognitionService();
