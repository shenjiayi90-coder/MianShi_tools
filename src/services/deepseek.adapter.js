/**
 * Convert the app's internal (Gemini-shaped) request objects into the
 * OpenAI-compatible message array that DeepSeek expects.
 *
 * Why keep the Gemini shape at all? Every builder in `llm.service.js`
 * (`buildGeminiRequest`, `buildIntelligentTranscriptionRequest`, image
 * requests, …) already produces it, and the session manager, prompt loader and
 * streaming plumbing all speak it. Converting at the transport boundary means
 * the provider swap touches one layer instead of rewriting every caller — and
 * it leaves the door open for a Gemini fallback later.
 *
 * Gemini shape in:
 *   {
 *     contents: [
 *       { role: 'user'|'model', parts: [ {text}, {inlineData:{data,mimeType}} ] }
 *     ],
 *     systemInstruction: { parts: [ {text} ] },
 *     generationConfig: { temperature, topP, topK, maxOutputTokens, ... }
 *   }
 *
 * OpenAI shape out:
 *   {
 *     messages: [
 *       { role: 'system', content: '...' },
 *       { role: 'user', content: 'text' },
 *       { role: 'user', content: [ {type:'text',...}, {type:'image_url',...} ] },
 *       { role: 'assistant', content: '...' }
 *     ],
 *     maxTokens, temperature, topP
 *   }
 */

/** Gemini role → OpenAI role. Gemini calls the assistant "model". */
function mapRole(role) {
  if (role === 'model') return 'assistant';
  if (role === 'assistant') return 'assistant';
  if (role === 'system') return 'system';
  return 'user';
}

/** Flatten a Gemini `parts` array into OpenAI content (string or block array). */
function convertParts(parts) {
  if (!Array.isArray(parts)) return '';

  const blocks = [];
  let plainText = '';
  let hasNonText = false;

  for (const part of parts) {
    if (!part) continue;

    if (typeof part.text === 'string' && part.text.length > 0) {
      plainText += part.text;
      blocks.push({ type: 'text', text: part.text });
      continue;
    }

    // Inline image → OpenAI data-URL image block. This is the path used by
    // screenshot analysis (processImageWithSkill*).
    const inline = part.inlineData || part.inline_data;
    if (inline && inline.data) {
      hasNonText = true;
      const mimeType = inline.mimeType || inline.mime_type || 'image/png';
      blocks.push({
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${inline.data}` }
      });
    }
  }

  // Text-only messages stay as plain strings: it is the form every
  // OpenAI-compatible endpoint handles most predictably.
  if (!hasNonText) return plainText;
  return blocks;
}

/** Extract the system instruction text, if the request carries one. */
function extractSystemText(systemInstruction) {
  if (!systemInstruction) return '';
  const parts = Array.isArray(systemInstruction.parts)
    ? systemInstruction.parts
    : (typeof systemInstruction === 'string' ? [{ text: systemInstruction }] : []);
  return parts
    .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
    .join('\n')
    .trim();
}

/**
 * Translate a Gemini-shaped request plus runtime options into DeepSeek params.
 *
 * @param {object} geminiRequest - internal request object
 * @param {object} options
 * @param {string} options.model
 * @param {number} [options.maxTokens] - overrides generationConfig.maxOutputTokens
 * @param {number} [options.temperature]
 * @param {string} [options.reasoningEffort] - 'none' | 'low' | 'high' | 'max'
 * @returns {{model, messages, maxTokens, temperature, topP, reasoningEffort}}
 */
function toDeepSeekParams(geminiRequest, options = {}) {
  const request = geminiRequest || {};
  const generation = request.generationConfig || {};

  const messages = [];

  const systemText = extractSystemText(request.systemInstruction);
  if (systemText) {
    messages.push({ role: 'system', content: systemText });
  }

  const contents = Array.isArray(request.contents)
    ? request.contents
    : (request.contents ? [request.contents] : []);

  for (const entry of contents) {
    // A bare string is a valid content entry in some call paths.
    if (typeof entry === 'string') {
      if (entry.trim()) messages.push({ role: 'user', content: entry });
      continue;
    }
    if (!entry) continue;

    const content = convertParts(entry.parts);
    const isEmpty = typeof content === 'string' ? content.trim().length === 0 : content.length === 0;
    if (isEmpty) continue;

    messages.push({ role: mapRole(entry.role), content });
  }

  // DeepSeek rejects an empty conversation, and an empty turn is always a bug
  // upstream — surface it as a clear error rather than a 400 from the API.
  if (messages.length === 0) {
    throw new Error('Converted request has no messages to send to DeepSeek');
  }

  const maxTokens = options.maxTokens != null
    ? options.maxTokens
    : (generation.maxOutputTokens != null ? generation.maxOutputTokens : undefined);

  const temperature = options.temperature != null
    ? options.temperature
    : (generation.temperature != null ? generation.temperature : undefined);

  const topP = options.topP != null
    ? options.topP
    : (generation.topP != null ? generation.topP : undefined);

  return {
    model: options.model,
    messages,
    maxTokens,
    temperature,
    topP,
    reasoningEffort: options.reasoningEffort
  };
}

module.exports = { toDeepSeekParams, convertParts, mapRole, extractSystemText };
