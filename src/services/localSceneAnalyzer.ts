import { DetectionObject, SceneAnalysisResult } from '../types';

const MODEL_ID = 'onnx-community/Qwen2-VL-2B-Instruct';
let modelPromise: Promise<{ processor: any; model: any }> | null = null;
let inferenceQueue = Promise.resolve();

async function loadModel(): Promise<{ processor: any; model: any }> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { AutoProcessor, Qwen2VLForConditionalGeneration } = await import('@huggingface/transformers');
      const processor = await AutoProcessor.from_pretrained(MODEL_ID);
      try {
        const model = await Qwen2VLForConditionalGeneration.from_pretrained(MODEL_ID, {
          device: 'webgpu',
          dtype: 'q4',
        });
        return { processor, model };
      } catch (gpuError) {
        console.info('WebGPU scene inference unavailable; using WASM CPU inference.', gpuError);
        const model = await Qwen2VLForConditionalGeneration.from_pretrained(MODEL_ID, {
          device: 'wasm',
          dtype: 'q8',
        });
        return { processor, model };
      }
    })().catch((error) => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

function parseModelResult(raw: string): Record<string, any> {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Local scene model returned no JSON result.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function analyzeSceneLocally(
  imageData: string,
  cameraName: string,
  fallbackObjects: DetectionObject[] = []
): Promise<SceneAnalysisResult> {
  // Serialize use of the shared model so periodic refreshes cannot overlap inference.
  const run = inferenceQueue.then(async () => {
    if (!imageData) throw new Error('The active camera has no frame to analyze.');

    const [{ processor, model }, { RawImage }] = await Promise.all([
      loadModel(),
      import('@huggingface/transformers'),
    ]);
    const image = await (await RawImage.read(imageData)).resize(448, 448);
    const prompt = `Analyze this security camera frame from "${cameraName || 'Camera'}". Describe only details visibly supported by the image. Be specific about people, animals (species or breed only when clearly identifiable), vehicles, objects, actions, lighting, weather, and safety risks. Never identify a person by name or infer intent. For safety, report a threat only when a visible, concrete hazard is present; otherwise use nominal. Return only valid JSON with this schema: {"summary":"Detailed 2-3 sentence description of the scene, activity, and visible entities","threatLevel":"nominal|elevated|critical","threatConfidence":0.0,"objects":[{"id":"unique short id","label":"visible description","category":"person|animal|car|object|threat|weather","confidence":0.0,"bbox":[0.0,0.0,0.0,0.0],"threatLevel":"none|warning|critical","motionVector":[0.0,0.0],"distanceMeters":0.0,"speedMph":0.0,"isKnown":false,"nameTag":""}],"lightingCondition":"visible lighting","weather":"visible weather or Unknown","environmentalDetails":{"luxRating":"Unknown","visibilityMeters":0,"fogDensityPct":0,"precipitationRate":"Unknown","surfaceCondition":"Unknown","entryPointsSecure":false,"blindSpotsDetected":0,"ambientNoiseDb":0}}. Object bounding boxes must be normalized [x,y,width,height] values from 0 to 1. Include only clearly visible objects, and do not invent measurements. Use empty objects when no distinct entities can be identified.`;
    const conversation = [{
      role: 'user',
      content: [
        { type: 'image' },
        { type: 'text', text: prompt },
      ],
    }];
    const formattedPrompt = processor.apply_chat_template(conversation, { add_generation_prompt: true });
    const inputs = await processor(formattedPrompt, image);
    const generated = await model.generate({ ...inputs, max_new_tokens: 700, do_sample: false });
    const output = processor.batch_decode(
      generated.slice(null, [inputs.input_ids.dims.at(-1), null]),
      { skip_special_tokens: true }
    )[0] as string;
    const parsed = parseModelResult(output);

    const allowedThreats = ['nominal', 'elevated', 'critical'];
    const threatLevel = allowedThreats.includes(parsed.threatLevel) ? parsed.threatLevel : 'nominal';
    const objects: DetectionObject[] = Array.isArray(parsed.objects)
      ? parsed.objects.map((item: any, index: number) => ({
          id: typeof item.id === 'string' && item.id ? item.id : `local-scene-${Date.now()}-${index}`,
          label: typeof item.label === 'string' ? item.label : 'Detected object',
          category: ['person', 'animal', 'car', 'object', 'threat', 'weather'].includes(item.category) ? item.category : 'object',
          confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.5)),
          bbox: Array.isArray(item.bbox) && item.bbox.length === 4
            ? item.bbox.map((n: unknown) => Math.max(0, Math.min(1, Number(n) || 0))) as [number, number, number, number]
            : [0, 0, 0, 0],
          threatLevel: ['none', 'warning', 'critical'].includes(item.threatLevel) ? item.threatLevel : 'none',
          motionVector: [0, 0],
          distanceMeters: Math.max(0, Number(item.distanceMeters) || 0),
          speedMph: Math.max(0, Number(item.speedMph) || 0),
          isKnown: false,
          nameTag: typeof item.nameTag === 'string' ? item.nameTag : '',
        }))
      : fallbackObjects;

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Scene analysis completed.',
      threatLevel,
      threatConfidence: Math.max(0, Math.min(1, Number(parsed.threatConfidence) || 0.5)),
      objects,
      lightingCondition: typeof parsed.lightingCondition === 'string' ? parsed.lightingCondition : 'Unknown',
      weather: typeof parsed.weather === 'string' ? parsed.weather : 'Unknown',
      environmentalDetails: {
        luxRating: String(parsed.environmentalDetails?.luxRating || 'Unknown'),
        visibilityMeters: Math.max(0, Number(parsed.environmentalDetails?.visibilityMeters) || 0),
        fogDensityPct: Math.max(0, Math.min(100, Number(parsed.environmentalDetails?.fogDensityPct) || 0)),
        precipitationRate: String(parsed.environmentalDetails?.precipitationRate || 'Unknown'),
        surfaceCondition: String(parsed.environmentalDetails?.surfaceCondition || 'Unknown'),
        entryPointsSecure: parsed.environmentalDetails?.entryPointsSecure === true,
        blindSpotsDetected: Math.max(0, Number(parsed.environmentalDetails?.blindSpotsDetected) || 0),
        ambientNoiseDb: Math.max(0, Number(parsed.environmentalDetails?.ambientNoiseDb) || 0),
      },
      timestamp: Date.now(),
    };
  });
  inferenceQueue = run.then(() => undefined, () => undefined);
  return run;
}
