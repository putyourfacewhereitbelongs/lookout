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
 */
class PetRecognitionService {
  async match(imageData: string, profiles: FaceProfile[], threshold = 0.72): Promise<PetMatch | null> {
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

export const petRecognitionService = new PetRecognitionService();
