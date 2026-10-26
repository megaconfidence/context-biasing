const WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';
const VOXTRAL_MODEL = 'voxtral-mini-transcribe-3';
const MISTRAL_TRANSCRIPTIONS_URL = 'https://api.mistral.ai/v1/audio/transcriptions';

// Voxtral accepts at most 100 context_bias entries; the same cap applies to Whisper so both models get identical terms.
const MAX_TERMS = 100;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
// Must match ratelimits[0].simple.limit in wrangler.jsonc; used in the error message.
const RATE_LIMIT_PER_MINUTE = 9;

type ModelId = 'whisper' | 'voxtral';

interface Transcription {
	text: string;
	// Exactly what was sent to the model as biasing context, shown in the UI for transparency.
	biasSent: string | string[] | null;
}

class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/api/transcribe') {
			if (request.method !== 'POST') {
				return json({ error: 'Method not allowed' }, 405);
			}

			// Checked before reading the body, so rejected requests cost no model calls.
			const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
			const { success } = await env.TRANSCRIBE_RATE_LIMITER.limit({ key: ip });
			if (!success) {
				console.warn(JSON.stringify({ event: 'rate_limited', path: url.pathname }));
				return Response.json(
					{ error: `Rate limit reached: ${RATE_LIMIT_PER_MINUTE} model calls per minute. Try again in a minute.` },
					{ status: 429, headers: { 'Retry-After': '60' } },
				);
			}

			try {
				return await handleTranscribe(request, env);
			} catch (err) {
				const status = err instanceof HttpError ? err.status : 500;
				const message = err instanceof Error ? err.message : String(err);
				console.error(JSON.stringify({ event: 'transcribe_error', status, message }));
				return json({ error: message }, status);
			}
		}

		return json({ error: 'Not found' }, 404);
	},
} satisfies ExportedHandler<Env>;

async function handleTranscribe(request: Request, env: Env): Promise<Response> {
	const contentLength = Number(request.headers.get('content-length') ?? 0);
	if (contentLength > MAX_AUDIO_BYTES + 64 * 1024) {
		throw new HttpError(413, `Audio must be under ${MAX_AUDIO_BYTES / 1024 / 1024} MB`);
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		throw new HttpError(400, 'Expected a multipart/form-data body');
	}

	const model = form.get('model');
	if (model !== 'whisper' && model !== 'voxtral') {
		throw new HttpError(400, 'model must be "whisper" or "voxtral"');
	}

	const audio = form.get('audio');
	if (!(audio instanceof File) || audio.size === 0) {
		throw new HttpError(400, 'An audio file is required');
	}
	if (audio.size > MAX_AUDIO_BYTES) {
		throw new HttpError(413, `Audio must be under ${MAX_AUDIO_BYTES / 1024 / 1024} MB`);
	}

	const bias = form.get('bias') === 'true';
	const terms = parseTerms(form.getAll('terms'));
	if (terms.length > MAX_TERMS) {
		throw new HttpError(400, `At most ${MAX_TERMS} terms are supported (got ${terms.length})`);
	}
	const biasTerms = bias && terms.length > 0 ? terms : null;

	const started = Date.now();
	const result = model === 'whisper' ? await transcribeWhisper(env, audio, biasTerms) : await transcribeVoxtral(env, audio, biasTerms);
	const latencyMs = Date.now() - started;

	console.log(JSON.stringify({ event: 'transcribe', model, bias: biasTerms !== null, terms: biasTerms?.length ?? 0, latencyMs }));

	return json({ model, bias: biasTerms !== null, latencyMs, ...result });
}

function parseTerms(values: Array<File | string>): string[] {
	const seen = new Set<string>();
	const terms: string[] = [];
	for (const value of values) {
		if (typeof value !== 'string') continue;
		const term = value.trim().replace(/\s+/g, ' ');
		const key = term.toLowerCase();
		if (term && !seen.has(key)) {
			seen.add(key);
			terms.push(term);
		}
	}
	return terms;
}

async function transcribeWhisper(env: Env, audio: File, terms: string[] | null): Promise<Transcription> {
	const input: Ai_Cf_Openai_Whisper_Large_V3_Turbo_Input = {
		audio: toBase64(await audio.arrayBuffer()),
	};
	// Whisper has no dedicated vocabulary parameter; initial_prompt is its standard way to hint at spellings.
	if (terms) {
		input.initial_prompt = terms.join(', ');
	}

	let output: Ai_Cf_Openai_Whisper_Large_V3_Turbo_Output;
	try {
		output = await env.AI.run(WHISPER_MODEL, input);
	} catch (err) {
		throw new HttpError(502, `Workers AI error: ${err instanceof Error ? err.message : String(err)}`);
	}

	return { text: output.text?.trim() ?? '', biasSent: input.initial_prompt ?? null };
}

async function transcribeVoxtral(env: Env, audio: File, terms: string[] | null): Promise<Transcription> {
	if (!env.MISTRAL_API_KEY) {
		throw new HttpError(500, 'MISTRAL_API_KEY is not configured');
	}

	// context_bias items may not contain whitespace or commas, so multi-word phrases are joined with underscores.
	const biasSent = terms?.map((term) => term.replace(/[\s,]+/g, '_')) ?? null;

	const body = new FormData();
	body.append('model', VOXTRAL_MODEL);
	body.append('file', audio, audio.name || 'audio');
	for (const term of biasSent ?? []) {
		body.append('context_bias', term);
	}

	const res = await fetch(MISTRAL_TRANSCRIPTIONS_URL, {
		method: 'POST',
		headers: { Authorization: `Bearer ${env.MISTRAL_API_KEY}` },
		body,
	});

	if (!res.ok) {
		const detail = (await res.text()).slice(0, 500);
		throw new HttpError(502, `Mistral API error ${res.status}: ${detail}`);
	}

	const data = await res.json<{ text?: string }>();
	return { text: data.text?.trim() ?? '', biasSent };
}

function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const chunkSize = 0x8000;
	let binary = '';
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

function json(body: unknown, status = 200): Response {
	return Response.json(body, { status });
}
