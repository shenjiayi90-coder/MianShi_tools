const { DeepSeekClient, DeepSeekApiError } = require('./deepseek.client');
const { toDeepSeekParams } = require('./deepseek.adapter');
const logger = require('../core/logger').createServiceLogger('LLM');
const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');
const profileLoader = require('./profile-loader');

class LLMService {
  constructor() {
    this.client = null;
    this.model = null;
    this.isInitialized = false;
    this.requestCount = 0;
    this.errorCount = 0;

    this.initializeClient();
  }

  /** Active provider id. Only 'deepseek' is implemented today. */
  get provider() {
    return config.get('llm.provider') || 'deepseek';
  }

  /** Config subtree for the active provider (model, timeout, generation, …). */
  get providerConfig() {
    return config.get(`llm.${this.provider}`) || {};
  }

  initializeClient() {
    const apiKey = config.getApiKey('DEEPSEEK');

    if (!apiKey || apiKey === 'your_deepseek_api_key_here') {
      logger.warn('DeepSeek API key not configured', {
        keyExists: !!apiKey,
        isPlaceholder: apiKey === 'your_deepseek_api_key_here'
      });
      this.isInitialized = false;
      return;
    }

    try {
      const providerConfig = this.providerConfig;

      this.client = new DeepSeekClient({
        apiKey,
        baseUrl: providerConfig.baseUrl,
        timeout: providerConfig.timeout,
        userAgent: this.getUserAgent()
      });

      this.model = providerConfig.model;
      this.isInitialized = true;

      logger.info('DeepSeek client initialized successfully', {
        provider: this.provider,
        model: this.model,
        baseUrl: providerConfig.baseUrl,
        reasoningEffort: providerConfig.reasoningEffort || 'default',
        timeout: providerConfig.timeout
      });
    } catch (error) {
      logger.error('Failed to initialize DeepSeek client', {
        error: error.message
      });
      this.isInitialized = false;
    }
  }

  getGenerationConfig(overrides = {}) {
    const defaults = this.providerConfig.generation || {};
    const fallback = {
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 8192
    };

    const merged = { ...fallback, ...defaults, ...overrides };
    return Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value !== undefined && value !== null)
    );
  }

  applyGenerationDefaults(request, overrides = {}) {
    request.generationConfig = this.getGenerationConfig({ ...(request.generationConfig || {}), ...overrides });
    return request;
  }

  /**
   * Normalize a DeepSeek result into the {text, finishReason} shape the rest of
   * this service expects.
   *
   * A reasoning model can legitimately return an empty `content` when the
   * thinking phase exhausts `max_tokens` (finish_reason === 'length'). That is
   * reported as a specific error instead of a generic parse failure, because
   * the fix — raise the token budget or lower reasoning effort — is different
   * from a malformed-response problem.
   */
  extractTextFromResult(result) {
    const text = result && typeof result.text === 'string' ? result.text.trim() : '';
    const reasoning = result && typeof result.reasoning === 'string' ? result.reasoning : '';
    const finishReason = (result && result.finishReason) || null;

    if (text.length > 0) {
      return { text, finishReason, reasoning };
    }

    if (finishReason === 'length') {
      throw new Error(
        `DeepSeek ran out of tokens while thinking (${reasoning.length} chars of reasoning, no answer). ` +
        'Raise maxOutputTokens or lower DEEPSEEK_REASONING_EFFORT.'
      );
    }

    throw new Error(
      `DeepSeek returned no answer text${finishReason ? ` (finish_reason: ${finishReason})` : ''}`
    );
  }

  /**
   * Process an image directly with DeepSeek vision using the active skill prompt.
   * The image buffer is sent as inlineData alongside a concise instruction.
   * For image-based queries, we include the skill prompt (e.g., DSA) as systemInstruction.
   * @param {Buffer} imageBuffer - PNG/JPEG image bytes
   * @param {string} mimeType - e.g., 'image/png' or 'image/jpeg'
   * @param {string} activeSkill - current skill (e.g. 'dsa')
   * @param {Array} sessionMemory - optional (not required for image)
   * @param {string|null} programmingLanguage - optional language context for skills that need it
   * @returns {Promise<{response: string, metadata: object}>}
   */
  async processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check the DeepSeek API key in Settings.');
    }

    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided to processImageWithSkill');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      // Build system instruction using the skill prompt (with optional language injection)
      const { promptLoader } = require('../../prompt-loader');
      const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';

      // Build request with text + image parts
      const base64 = imageBuffer.toString('base64');

      const request = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: this.formatImageInstruction(activeSkill, programmingLanguage) },
              { inlineData: { data: base64, mimeType } }
            ]
          }
        ]
      };

      this.applyGenerationDefaults(request);

      if (skillPrompt && skillPrompt.trim().length > 0) {
        // Skill prompts are English-only, so append the answer-language rule.
        request.systemInstruction = {
          parts: [{ text: skillPrompt + this.getResponseLanguageInstruction() }]
        };
      }

      // executeRequest handles retries, timeouts and model fallback internally.
      const responseText = await this.executeRequest(request);

      // Enforce language in code fences if provided
      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(responseText, programmingLanguage)
        : responseText;

      logger.logPerformance('LLM image processing', startTime, {
        activeSkill,
        imageSize: imageBuffer.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isImageAnalysis: true,
          mimeType
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM image processing failed', {
        error: error.message,
        activeSkill,
        requestId: this.requestCount
      });

      if (config.get('llm.deepseek.fallbackEnabled')) {
        return this.generateFallbackResponse('[image]', activeSkill);
      }
      throw error;
    }
  }

  async processImageWithSkillStream(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null, onDelta = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check the DeepSeek API key in Settings.');
    }

    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided to processImageWithSkillStream');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const { promptLoader } = require('../../prompt-loader');
      const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';
      const base64 = imageBuffer.toString('base64');

      const geminiRequest = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: this.formatImageInstruction(activeSkill, programmingLanguage) },
              { inlineData: { data: base64, mimeType } }
            ]
          }
        ]
      };
      this.applyGenerationDefaults(geminiRequest);
      if (skillPrompt && skillPrompt.trim().length > 0) {
        // Skill prompts are English-only, so append the answer-language rule.
        geminiRequest.systemInstruction = {
          parts: [{ text: skillPrompt + this.getResponseLanguageInstruction() }]
        };
      }

      const fullText = await this.executeStreamingRequest(geminiRequest, (delta) => {
        if (typeof onDelta === 'function' && delta) {
          onDelta(delta);
        }
      });

      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(fullText, programmingLanguage)
        : fullText;

      logger.logPerformance('LLM image streaming', startTime, {
        activeSkill,
        imageSize: imageBuffer.length,
        responseLength: finalResponse.length,
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          streamed: true,
          isImageAnalysis: true,
          mimeType
        }
      };
    } catch (error) {
      logger.warn('Streaming image analysis failed, falling back to non-streaming', {
        error: error.message,
        requestId: this.requestCount
      });
      return this.processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory, programmingLanguage);
    }
  }

  formatImageInstruction(activeSkill, programmingLanguage) {
    const langNote = programmingLanguage ? ` Use only ${programmingLanguage.toUpperCase()} for any code.` : '';
    return `Analyze this image for a ${activeSkill.toUpperCase()} question. Extract the problem concisely and provide the best possible solution with explanation and final code.${langNote}${this.getResponseLanguageInstruction()}${this._profileHint()}`;
  }

  async processTextWithSkill(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check the DeepSeek API key in Settings.');
    }

    const startTime = Date.now();
    this.requestCount++;
    
    try {
      logger.info('Processing text with LLM', {
        activeSkill,
        textLength: text.length,
        hasSessionMemory: sessionMemory.length > 0,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      const geminiRequest = this.buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage);

      // executeRequest already retries internally with backoff, so a second
      // outer attempt would just double the worst-case wait before the user
      // sees an error.
      const response = await this.executeRequest(geminiRequest);
      
      // Enforce language in code fences if programmingLanguage specified
      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(response, programmingLanguage)
        : response;

      logger.logPerformance('LLM text processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM processing failed', {
        error: error.message,
        activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      if (config.get('llm.deepseek.fallbackEnabled')) {
        return this.generateFallbackResponse(text, activeSkill);
      }

      throw error;
    }
  }

  async processTextWithSkillStream(text, activeSkill, sessionMemory = [], programmingLanguage = null, onDelta = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check the DeepSeek API key in Settings.');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const geminiRequest = this.buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage);

      const fullText = await this.executeStreamingRequest(geminiRequest, (delta) => {
        if (typeof onDelta === 'function' && delta) {
          onDelta(delta);
        }
      });

      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(fullText, programmingLanguage)
        : fullText;

      logger.logPerformance('LLM text streaming', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          streamed: true
        }
      };
    } catch (error) {
      logger.warn('Streaming text failed, falling back to non-streaming', {
        error: error.message,
        requestId: this.requestCount
      });
      return this.processTextWithSkill(text, activeSkill, sessionMemory, programmingLanguage);
    }
  }

  async processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check the DeepSeek API key in Settings.');
    }

    const startTime = Date.now();
    this.requestCount++;
    
    try {
      logger.info('Processing transcription with intelligent response', {
        activeSkill,
        textLength: text.length,
        hasSessionMemory: sessionMemory.length > 0,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      const geminiRequest = this.buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage);

      const response = await this.executeRequest(geminiRequest);

      // Enforce language in code fences if programmingLanguage specified
      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(response, programmingLanguage)
        : response;

      logger.logPerformance('LLM transcription processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isTranscriptionResponse: true
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM transcription processing failed', {
        error: error.message,
        activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      if (config.get('llm.deepseek.fallbackEnabled')) {
        return this.generateIntelligentFallbackResponse(text, activeSkill);
      }
      
      throw error;
    }
  }

  /**
   * Normalize all triple-backtick code fences to the selected programming language tag.
   * Does not alter the inner code; only ensures fence language tags are correct.
   */
  enforceProgrammingLanguage(text, programmingLanguage) {
    try {
      if (!text || !programmingLanguage) return text;
      const norm = String(programmingLanguage).toLowerCase();
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const fenceTag = fenceTagMap[norm] || norm || 'text';

      // Replace all triple-backtick fences' language token with the selected tag
      const replacedBackticks = text.replace(/```([^\n]*)\n/g, (match, info) => {
        const current = (info || '').trim();
        // If already the desired fenceTag as the first token, keep as is
        if (current.split(/\s+/)[0].toLowerCase() === fenceTag) return match;
        return '```' + fenceTag + '\n';
      });

      // Optionally normalize tildes fences to backticks with correct tag
      const normalizedTildes = replacedBackticks.replace(/~~~([^\n]*)\n/g, () => '```' + fenceTag + '\n');

      return normalizedTildes;
    } catch (_) {
      return text;
    }
  }

  buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage) {
    // Check if we have the new conversation history format
    const sessionManager = require('../managers/session.manager');
    
    if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const conversationHistory = sessionManager.getConversationHistory(15);
      const skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
      return this.buildGeminiRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage);
    }

    // Fallback to old method for compatibility - now with programming language support
    const requestComponents = promptLoader.getRequestComponents(
      activeSkill, 
      text, 
      sessionMemory,
      programmingLanguage
    );

    const request = {
      contents: []
    };

    this.applyGenerationDefaults(request);

    // Use the skill prompt that already has programming language injected
    if (requestComponents.shouldUseModelMemory && requestComponents.skillPrompt) {
      request.systemInstruction = {
        parts: [{ text: requestComponents.skillPrompt }]
      };
      
      logger.debug('Using language-enhanced system instruction for skill', {
        skill: activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        promptLength: requestComponents.skillPrompt.length,
        requiresProgrammingLanguage: requestComponents.requiresProgrammingLanguage
      });
    }

    request.contents.push({
      role: 'user',
      parts: [{ text: this.formatUserMessage(text, activeSkill) }]
    });

    return request;
  }

  buildGeminiRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage) {
    const request = {
      contents: []
    };

    this.applyGenerationDefaults(request);

    // Use the skill prompt from context (which may already include programming language)
    if (skillContext.skillPrompt) {
      // The skill prompts are authored in English; without this the model
      // mirrors that and answers in English. Appending the language rule here
      // covers the chat/screenshot paths, whose system prompt is the skill.
      request.systemInstruction = {
        parts: [{ text: skillContext.skillPrompt + this.getResponseLanguageInstruction() }]
      };
      
      logger.debug('Using skill context prompt as system instruction', {
        skill: activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        promptLength: skillContext.skillPrompt.length,
        requiresProgrammingLanguage: skillContext.requiresProgrammingLanguage || false,
        hasLanguageInjection: programmingLanguage && skillContext.requiresProgrammingLanguage
      });
    }

    // Add conversation history (excluding system messages) with validation
    const conversationContents = conversationHistory
      .filter(event => {
        return event.role !== 'system' && 
               event.content && 
               typeof event.content === 'string' && 
               event.content.trim().length > 0;
      })
      .map(event => {
        const content = event.content.trim();
        return {
          role: event.role === 'model' ? 'model' : 'user',
          parts: [{ text: content }]
        };
      });

    // Add the conversation history
    request.contents.push(...conversationContents);

    // Format and validate the current user input
    const formattedMessage = this.formatUserMessage(text, activeSkill);
    if (!formattedMessage || formattedMessage.trim().length === 0) {
      throw new Error('Failed to format user message or message is empty');
    }

    // Add the current user input
    request.contents.push({
      role: 'user',
      parts: [{ text: formattedMessage }]
    });

    logger.debug('Built LLM request with conversation history', {
      skill: activeSkill,
      programmingLanguage: programmingLanguage || 'not specified',
      historyLength: conversationHistory.length,
      totalContents: request.contents.length,
      hasSystemInstruction: !!request.systemInstruction,
      requiresProgrammingLanguage: skillContext.requiresProgrammingLanguage || false
    });

    return request;
  }

  buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage) {
    // Validate input text first
    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Empty or invalid transcription text provided to buildIntelligentTranscriptionRequest');
    }

    // Check if we have the new conversation history format
    const sessionManager = require('../managers/session.manager');
    
    if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const conversationHistory = sessionManager.getConversationHistory(10);
      const skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
      return this.buildIntelligentTranscriptionRequestWithHistory(cleanText, activeSkill, conversationHistory, skillContext, programmingLanguage);
    }

    // Fallback to basic intelligent request
    const request = {
      contents: []
    };

    this.applyGenerationDefaults(request);

    // Add intelligent filtering system instruction
    const intelligentPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage);
    if (!intelligentPrompt) {
      throw new Error('Failed to generate intelligent transcription prompt');
    }

    request.systemInstruction = {
      parts: [{ text: intelligentPrompt }]
    };

    request.contents.push({
      role: 'user',
      parts: [{ text: cleanText }]
    });

    logger.debug('Built basic intelligent transcription request', {
      skill: activeSkill,
      programmingLanguage: programmingLanguage || 'not specified',
      textLength: cleanText.length,
      hasSystemInstruction: !!request.systemInstruction
    });

    return request;
  }

  buildIntelligentTranscriptionRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage) {
    const request = {
      contents: []
    };

    this.applyGenerationDefaults(request);

  // For chat/transcription messages, DO NOT include the full skill prompt; use only the intelligent filter prompt
  const intelligentPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage);
  request.systemInstruction = { parts: [{ text: intelligentPrompt }] };

    // Add recent conversation history (excluding system messages) with validation
    const conversationContents = conversationHistory
      .filter(event => {
        // Filter out system messages and ensure content exists and is valid
        return event.role !== 'system' &&
               event.content &&
               typeof event.content === 'string' &&
               event.content.trim().length > 0;
      })
      // Voice history is counted in FRAGMENTS, not turns: DashScope splits one
      // spoken sentence at every pause, so a single interviewer question plus a
      // candidate answer can easily be 6-8 fragments. 24 fragments ≈ 3-4 real
      // exchanges, which is the depth a follow-up ("那第二种呢") needs. The
      // context cost is a few KB — negligible next to the profile block.
      .slice(-24) // Keep last ~24 fragments for context
      .map(event => {
        const content = event.content.trim();
        if (!content) {
          logger.warn('Empty content found in conversation history', { event });
          return null;
        }
        return {
          role: event.role === 'model' ? 'model' : 'user',
          parts: [{ text: content }]
        };
      })
      .filter(content => content !== null); // Remove any null entries

    // Add the conversation history
    request.contents.push(...conversationContents);

    // Validate and add the current transcription
    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Empty or invalid transcription text provided');
    }

    request.contents.push({
      role: 'user',
      parts: [{ text: cleanText }]
    });

    // Ensure we have at least one content item
    if (request.contents.length === 0) {
      throw new Error('No valid content to send to the API');
    }

    logger.debug('Built intelligent transcription request with conversation history', {
      skill: activeSkill,
      programmingLanguage: programmingLanguage || 'not specified',
      historyLength: conversationHistory.length,
      totalContents: request.contents.length,
      hasSkillPrompt: !!skillContext.skillPrompt,
      cleanTextLength: cleanText.length,
      requiresProgrammingLanguage: skillContext.requiresProgrammingLanguage || false
    });

    return request;
  }

  /**
   * Natural-language the model should answer in.
   *
   * This is deliberately separate from `programmingLanguage` (the coding
   * language used for code fences). The prompts are written in English, so
   * without an explicit instruction the model mirrors the prompt language and
   * replies in English even when the question was asked in Chinese.
   */
  getResponseLanguage() {
    const configured = String(config.get('llm.responseLanguage') || '').trim();
    return configured || 'auto';
  }

  /**
   * Which speaker the current session is answering: 'interviewer' or 'me'.
   *
   * Set by main.js from the live speech routing state (it flips to 'me' when
   * system-audio capture is unavailable). The prompt builder needs it because
   * the "don't answer your own words" rule is only valid in 'interviewer'
   * mode — in 'me' mode those very words are the questions.
   */
  setAnsweredSpeaker(speaker) {
    this.answeredSpeaker = speaker === 'interviewer' ? 'interviewer' : 'me';
  }

  _getAnsweredSpeaker() {
    if (this.answeredSpeaker === 'interviewer' || this.answeredSpeaker === 'me') {
      return this.answeredSpeaker;
    }
    // Default to answering the user directly: if routing is unknown, a bare
    // "OK" reply is the worst possible failure mode.
    return 'me';
  }

  /** Human-readable name for a language code, for prompt injection. */
  _responseLanguageName(code) {
    const map = {
      zh: 'Simplified Chinese (简体中文)',
      'zh-cn': 'Simplified Chinese (简体中文)',
      'zh-tw': 'Traditional Chinese (繁體中文)',
      en: 'English',
      ja: 'Japanese (日本語)',
      ko: 'Korean (한국어)',
      es: 'Spanish (Español)',
      fr: 'French (Français)',
      de: 'German (Deutsch)',
      ru: 'Russian (Русский)',
      pt: 'Portuguese (Português)',
      it: 'Italian (Italiano)',
      hi: 'Hindi (हिन्दी)',
      ar: 'Arabic (العربية)'
    };
    return map[String(code).toLowerCase()] || code;
  }

  /**
   * Build the "answer in language X" instruction, or '' when set to auto.
   * Auto means: match whatever language the user wrote/spoke in.
   */
  getResponseLanguageInstruction() {
    const lang = this.getResponseLanguage();
    if (!lang || lang === 'auto') {
      return '\n\nLANGUAGE: Reply in the SAME natural language the user used. ' +
        'If the question is in Chinese, answer in Chinese; if in English, answer in English. ' +
        'Code identifiers and keywords stay in the programming language.';
    }
    const name = this._responseLanguageName(lang);
    return `\n\nLANGUAGE: Always write your explanation in ${name}, regardless of the language of the question. ` +
      'Keep code identifiers, keywords, and standard technical terms in their original form.';
  }

  getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage) {
    // Which voice the app was configured to answer. This matters enormously:
    // the "stay quiet on your own lines" rule below is only correct when the
    // INTERVIEWER is the one being answered. If the app has fallen back to the
    // microphone (no system-audio capture), the candidate's own lines ARE the
    // questions, and applying that rule would make every reply a bare "OK".
    const answeredSpeaker = this._getAnsweredSpeaker();

    let prompt = `# Intelligent Transcription Response System

You are an interview copilot. You receive live speech transcripts from up to TWO
speakers, each line prefixed with a tag:

  [面试官] / [Interviewer] — the person interviewing you. Their lines are
      usually questions, problem statements, or follow-ups.
  [我] / [Me] — you, the candidate. These are your own words: thinking out
      loud, partial answers, filler, or questions you asked back.
`;

    if (answeredSpeaker === 'interviewer') {
      prompt += `
WHO TO ANSWER: the interviewer ([面试官]).

- Treat the interviewer's lines as the task to solve. Answer them.
- Treat your own [我] lines as context about what you have already said or are
  currently saying. NEVER answer your own sentence, and never treat your own
  words as a new question — unless they are clearly addressed to the AI.
- If a message contains ONLY your own [我] lines, reply with exactly "OK" and
  nothing else. Do not explain, do not apologise, do not summarise.
`;
    } else {
      prompt += `
WHO TO ANSWER: the candidate ([我]) — that is the user of this app.

The interviewer's audio channel is not available right now, so the user is
speaking their questions directly. Every [我] line is something the user wants
help with, even when phrased as a statement or a fragment rather than a
question.

- ALWAYS answer [我] lines. Never reply with a bare "OK" — that is an error in
  this mode.
- If an [面试官] line does arrive, it is background audio; use it as context
  and still answer the [我] line.
`;
    }

    prompt += `
HOW TO ANSWER
- If the line you are answering is small talk, logistics, or unrelated to
  ${activeSkill.toUpperCase()}, reply with a short acknowledgment such as
  "Yeah, I'm listening. Ask your question relevant to ${activeSkill}."
- If it IS a ${activeSkill.toUpperCase()} question or a follow-up, give a
  complete, detailed answer.
- Lines without any tag are the user typing directly to you: always answer them.
- Judge the content, not the punctuation: a spoken question often arrives
  without a question mark ("讲一下快速排序" or "explain quicksort"), and a
  fragment cut off mid-sentence is still a request for help.
`;

    // Follow-up awareness (方案 B). Spoken interviews are full of references:
    // the interviewer completes a thought two turns later, asks "那第二种呢？"
    // or "你刚才说的那个方案", or drills into something the candidate just
    // said. Treating such a line as a standalone question produces a confident
    // answer to a question nobody asked.
    prompt += `
FOLLOW-UPS AND REFERENCE RESOLUTION (very important)

Interview speech is full of references instead of self-contained questions.
Before answering, ALWAYS resolve what the line actually refers to, using both
the conversation history above and the candidate profile below.

Typical patterns you must handle:
1. Ellipsis / continuation — the interviewer adds a clause to their previous
   sentence ("……那如果并发再高一个量级呢？"). Treat it as continuing that
   sentence, and answer the combined question.
2. Pronoun / demonstrative references — "那第二种呢", "为什么不用它",
   "这个方案有什么问题". Find the specific thing in recent history ("第二种"
   = the second option that was listed or discussed) and answer about THAT.
3. References to the candidate's own answers — "你刚才说召回率提升了，
   具体怎么做的？". The answer must be consistent with what the profile and
   history actually say, not a new invention.
4. Drill-downs — "为什么选 X 不选 Y", "深入讲讲刚才那个难点". Expand on the
   specific item from history/profile.

Resolution procedure:
- If the line is short or contains 指代词 (那/这个/它/第二种/刚才/你说的),
  scan the recent history for the referent BEFORE composing any answer.
- When resolved, you may briefly restate the resolved referent ("你指的是
  Token Bucket 方案——") so the candidate can confirm, then answer it fully.
- If the referent is genuinely ambiguous and no plausible reading exists in
  history, ask ONE short clarifying question instead of guessing.
`;

    // Natural-language of the answer (independent of the coding language).
    prompt += this.getResponseLanguageInstruction();

    // Add programming language context if provided
    if (programmingLanguage) {
      const lang = String(programmingLanguage).toLowerCase();
      const languageMap = { cpp: 'C++', c: 'C', python: 'Python', java: 'Java', javascript: 'JavaScript', js: 'JavaScript' };
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const languageTitle = languageMap[lang] || (lang.charAt(0).toUpperCase() + lang.slice(1));
      const fenceTag = fenceTagMap[lang] || lang || 'text';
      prompt += `\n\nCODING CONTEXT: Respond ONLY in ${languageTitle}. All code blocks must use triple backticks with language tag \`\`\`${fenceTag}\`\`\`. Do not include other languages unless explicitly asked.`;
    }

    prompt += `

## Response Rules:

### If the transcription is casual conversation, greetings, or NOT related to ${activeSkill}:
- Respond with: "Yeah, I'm listening. Ask your question relevant to ${activeSkill}."
- Or similar brief acknowledgments like: "I'm here, what's your ${activeSkill} question?"

### If the transcription IS relevant to ${activeSkill} or is a follow-up question:
- Provide a comprehensive, detailed response
- Use bullet points, examples, and explanations
- Focus on actionable insights and complete answers
- Do not truncate or shorten your response

### Examples of casual/irrelevant messages:
- "Hello", "Hi there", "How are you?"
- "What's the weather like?"
- "I'm just testing this"
- Random conversations not related to ${activeSkill}

### Examples of relevant messages:
- Actual questions about ${activeSkill} concepts
- Follow-up questions to previous responses
- Requests for clarification on ${activeSkill} topics
- Problem-solving requests related to ${activeSkill}

## Response Format:
- Keep responses detailed
- Use bullet points for structured answers
- Be encouraging and helpful
- Stay focused on ${activeSkill}

If the user's input is a coding or DSA problem statement and contains no code, produce a complete, runnable solution in the selected programming language without asking for more details. Always include the final implementation in a properly tagged code block.

Remember: Be intelligent about filtering - only provide detailed responses when the user actually needs help with ${activeSkill}.`;

    // Plan A: the candidate's real background. Appended last so it sits closest
    // to the conversation, and only when a profile actually exists — with no
    // profile this block is empty and the prompt behaves exactly as before.
    const profileContext = profileLoader.getProfileContext();
    if (profileContext) {
      prompt += profileContext;
    } else {
      // Guard against confident fabrication when nothing is known.
      prompt += `

# CANDIDATE PROFILE: not provided

No resume/project material is loaded. When asked about "你的项目/你的经历/你的简历",
do NOT invent employers, projects, numbers or outcomes. Say plainly that this
detail has not been configured in the app (in one short clause), then offer the
general/industry-standard answer the candidate can adapt.`;
    }

    return prompt;
  }

  formatUserMessage(text, activeSkill) {
    // The language instruction rides along with the user turn so it applies to
    // every path (chat, screenshot, voice) without editing each skill prompt.
    return `Context: ${activeSkill.toUpperCase()} analysis request${this.getResponseLanguageInstruction()}${this._profileHint()}\n\nText to analyze:\n${text}`;
  }

  /**
   * Short per-turn reminder that personal facts must come from the profile.
   *
   * The full profile block is only injected into the voice-transcript system
   * prompt (it is large); the chat/screenshot paths carry the skill prompt as
   * their system instruction, so a one-line rule here keeps those paths honest
   * too without bloating every request with the whole resume.
   */
  _profileHint() {
    if (!profileLoader.hasProfile()) return '';
    return '\n(CANDIDATE PROFILE is loaded: answer "你的项目/你的经历" questions only from it; never invent numbers or projects.)';
  }

  /** Build the DeepSeek params for a request, applying config defaults. */
  _paramsForRequest(request, overrides = {}) {
    const generation = request.generationConfig || {};
    return toDeepSeekParams(request, {
      model: this.model,
      maxTokens: generation.maxOutputTokens,
      temperature: generation.temperature,
      topP: generation.topP,
      reasoningEffort: this.providerConfig.reasoningEffort,
      ...overrides
    });
  }

  /**
   * True when an error is worth retrying. Auth errors, bad requests and
   * missing models will fail identically on every attempt, so retrying them
   * only delays the error the user needs to see.
   */
  _isRetryable(error) {
    if (error instanceof DeepSeekApiError && error.statusCode != null) {
      const status = error.statusCode;
      // 401/403 (auth), 400/404/422 (bad request / unknown model) are terminal.
      if (status === 401 || status === 403 || status === 400 || status === 404 || status === 422) {
        return false;
      }
      // 408/409/429/5xx and anything else transient is retryable.
      return true;
    }
    // Network-level failures (socket, DNS, timeout) are retryable.
    return true;
  }

  async executeRequest(geminiRequest) {
    const maxRetries = config.get('llm.deepseek.maxRetries');
    const primaryModel = this.model;
    const fallbackModels = config.get('llm.deepseek.fallbackModels') || [];
    const modelsToTry = [primaryModel, ...fallbackModels].filter(Boolean);

    logger.debug('Executing DeepSeek request', {
      hasModel: !!this.model,
      hasClient: !!this.client,
      requestKeys: Object.keys(geminiRequest),
      maxRetries,
      modelsToTry,
      provider: this.provider,
      nodeVersion: process.version,
      platform: process.platform
    });

    let lastError = null;

    for (const modelName of modelsToTry) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const params = this._paramsForRequest(geminiRequest, { model: modelName });

          logger.debug(`DeepSeek API attempt ${attempt} starting`, {
            timestamp: new Date().toISOString(),
            model: modelName,
            messageCount: params.messages.length,
            maxTokens: params.maxTokens,
            reasoningEffort: params.reasoningEffort || 'default'
          });

          const result = await this.client.createChatCompletion(params);
          const { text, finishReason, reasoning } = this.extractTextFromResult(result);

          if (finishReason === 'length') {
            logger.warn('DeepSeek response hit the max tokens limit', {
              attempt,
              finishReason,
              model: modelName,
              maxTokens: params.maxTokens,
              reasoningChars: reasoning.length
            });
          }

          logger.debug('DeepSeek API request successful', {
            attempt,
            model: modelName,
            responseLength: text.length,
            reasoningChars: reasoning.length,
            finishReason
          });

          return text;
        } catch (error) {
          const errorInfo = this.analyzeError(error);
          lastError = error;

          logger.warn(`DeepSeek API attempt ${attempt} failed for model ${modelName}`, {
            error: error.message,
            errorType: errorInfo.type,
            statusCode: error.statusCode || null,
            isNetworkError: errorInfo.isNetworkError,
            suggestedAction: errorInfo.suggestedAction,
            remainingAttempts: maxRetries - attempt,
            model: modelName
          });

          if (!this._isRetryable(error)) {
            logger.error('DeepSeek request failed with a non-retryable error', {
              error: error.message,
              statusCode: error.statusCode || null,
              model: modelName
            });
            throw error;
          }

          if (attempt === maxRetries) {
            break; // exit retry loop for this model and try next model
          }

          // Use exponential backoff with jitter for network errors
          const baseDelay = errorInfo.isNetworkError ? 2500 : 1500;
          const delay = baseDelay * attempt + Math.random() * 1000;

          logger.debug(`Waiting ${delay}ms before retry ${attempt + 1}`, {
            baseDelay,
            isNetworkError: errorInfo.isNetworkError,
            model: modelName
          });

          await this.delay(delay);
        }
      }
    }

    const finalErrorInfo = this.analyzeError(lastError);
    const finalError = new Error(
      `DeepSeek API failed after trying ${modelsToTry.join(', ')}: ${lastError?.message}`
    );
    finalError.errorAnalysis = finalErrorInfo;
    finalError.originalError = lastError;
    throw finalError;
  }

  /**
   * Streaming sibling of processTranscriptionWithIntelligentResponse. Emits
   * incremental text via onDelta so the UI can render the answer as it is
   * generated (much faster perceived latency). Returns the same
   * {response, metadata} shape. Falls back to the non-streaming path on any
   * streaming failure so reliability is never worse than before.
   */
  async processTranscriptionWithIntelligentResponseStream(text, activeSkill, sessionMemory = [], programmingLanguage = null, onDelta = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check the DeepSeek API key in Settings.');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const geminiRequest = this.buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage);

      const fullText = await this.executeStreamingRequest(geminiRequest, (delta) => {
        if (typeof onDelta === 'function' && delta) {
          onDelta(delta);
        }
      });

      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(fullText, programmingLanguage)
        : fullText;

      logger.logPerformance('LLM transcription streaming', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          streamed: true,
          isTranscriptionResponse: true
        }
      };
    } catch (error) {
      logger.warn('Streaming transcription failed, falling back to non-streaming', {
        error: error.message,
        requestId: this.requestCount
      });
      // Non-streaming path returns the same shape; the caller renders it as a
      // single final response.
      return this.processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory, programmingLanguage);
    }
  }

  /**
   * Run a streaming DeepSeek request with the same model-fallback + retry
   * policy as executeRequest. Accumulates and returns the full text; invokes
   * onDelta for each answer chunk.
   *
   * Retry safety: once a delta has been handed to the UI, retrying would
   * re-emit the beginning of the answer into a bubble that already shows it.
   * So a failure after the first delta is surfaced immediately rather than
   * retried — the caller's non-streaming fallback then produces one clean
   * answer instead of a spliced-together duplicate.
   */
  async executeStreamingRequest(geminiRequest, onDelta) {
    const maxRetries = config.get('llm.deepseek.maxRetries');
    const primaryModel = this.model;
    const fallbackModels = config.get('llm.deepseek.fallbackModels') || [];
    const modelsToTry = [primaryModel, ...fallbackModels].filter(Boolean);

    let lastError = null;

    for (const modelName of modelsToTry) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let emitted = false;

        try {
          const params = this._paramsForRequest(geminiRequest, { model: modelName });

          const result = await this.client.streamChatCompletion(params, (delta) => {
            emitted = true;
            if (typeof onDelta === 'function') onDelta(delta);
          });

          const { text, reasoning, finishReason } = this.extractTextFromResult(result);

          if (finishReason === 'length') {
            logger.warn('DeepSeek streamed response hit the max tokens limit', {
              attempt,
              model: modelName,
              maxTokens: params.maxTokens,
              reasoningChars: reasoning.length
            });
          }

          logger.debug('DeepSeek streaming request successful', {
            attempt,
            model: modelName,
            responseLength: text.length,
            reasoningChars: reasoning.length,
            finishReason
          });

          return text;
        } catch (error) {
          const errorInfo = this.analyzeError(error);
          lastError = error;

          logger.warn(`DeepSeek streaming attempt ${attempt} failed for model ${modelName}`, {
            error: error.message,
            errorType: errorInfo.type,
            statusCode: error.statusCode || null,
            emittedDeltas: emitted,
            remainingAttempts: maxRetries - attempt,
            model: modelName
          });

          // Partial output already reached the UI: retrying would duplicate it.
          if (emitted) {
            throw error;
          }

          if (!this._isRetryable(error)) {
            throw error;
          }

          if (attempt === maxRetries) {
            break;
          }

          const baseDelay = errorInfo.isNetworkError ? 2500 : 1500;
          const delay = baseDelay * attempt + Math.random() * 1000;
          await this.delay(delay);
        }
      }
    }

    throw lastError || new Error('DeepSeek streaming request failed');
  }

  async performPreflightCheck() {
    // Quick connectivity check against the active provider's endpoint.
    try {
      const startTime = Date.now();
      const host = this._providerHost();
      await this.testNetworkConnection({
        host,
        port: 443,
        name: 'DeepSeek API Endpoint'
      });
      const latency = Date.now() - startTime;

      logger.debug('Preflight check passed', { latency, host });
    } catch (error) {
      logger.warn('Preflight check failed', {
        error: error.message,
        suggestion: 'Network connectivity issue detected before API call'
      });
      // Don't throw here - let the actual API call fail with more detail
    }
  }

  /** Hostname of the configured provider endpoint, for connectivity checks. */
  _providerHost() {
    try {
      return new URL(this.providerConfig.baseUrl || 'https://api.deepseek.com/v1').hostname;
    } catch (_) {
      return 'api.deepseek.com';
    }
  }

  getUserAgent() {
    try {
      // Try to get user agent from Electron if available
      if (typeof navigator !== 'undefined' && navigator.userAgent) {
        return navigator.userAgent;
      }
      return `Node.js/${process.version} (${process.platform}; ${process.arch})`;
    } catch {
      return 'Unknown';
    }
  }

  analyzeError(error) {
    const errorMessage = (error && error.message ? error.message : '').toLowerCase();
    const status = error && error.statusCode ? error.statusCode : null;

    // HTTP status codes are the most reliable signal when present.
    if (status != null) {
      if (status === 401 || status === 403) {
        return {
          type: 'AUTH_ERROR',
          isNetworkError: false,
          suggestedAction: 'Verify the DeepSeek API key in Settings'
        };
      }
      if (status === 429) {
        return {
          type: 'RATE_LIMIT_ERROR',
          isNetworkError: false,
          suggestedAction: 'Wait before retrying or check your DeepSeek balance'
        };
      }
      if (status === 402) {
        return {
          type: 'BALANCE_ERROR',
          isNetworkError: false,
          suggestedAction: 'Your DeepSeek account balance is insufficient — top up at platform.deepseek.com'
        };
      }
      if (status === 400 || status === 404 || status === 422) {
        return {
          type: 'MODEL_ERROR',
          isNetworkError: false,
          suggestedAction: 'The configured model or request is not accepted by DeepSeek'
        };
      }
      if (status === 408 || status >= 500) {
        return {
          type: 'NETWORK_ERROR',
          isNetworkError: true,
          suggestedAction: 'DeepSeek is unreachable or overloaded — retrying'
        };
      }
    }

    // Network connectivity errors
    if (errorMessage.includes('fetch failed') ||
        errorMessage.includes('network error') ||
        errorMessage.includes('enotfound') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('econnreset') ||
        errorMessage.includes('socket hang up') ||
        errorMessage.includes('timeout')) {
      return {
        type: 'NETWORK_ERROR',
        isNetworkError: true,
        suggestedAction: 'Check internet connection and firewall settings'
      };
    }

    // API key errors reported as text rather than a status code
    if (errorMessage.includes('unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('invalid api key') ||
        errorMessage.includes('forbidden')) {
      return {
        type: 'AUTH_ERROR',
        isNetworkError: false,
        suggestedAction: 'Verify the DeepSeek API key in Settings'
      };
    }

    // Balance / quota
    if (errorMessage.includes('insufficient') ||
        errorMessage.includes('balance')) {
      return {
        type: 'BALANCE_ERROR',
        isNetworkError: false,
        suggestedAction: 'Your DeepSeek account balance is insufficient — top up at platform.deepseek.com'
      };
    }

    // Rate limiting
    if (errorMessage.includes('quota') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests')) {
      return {
        type: 'RATE_LIMIT_ERROR',
        isNetworkError: false,
        suggestedAction: 'Wait before retrying or check API quota'
      };
    }

    // Timeout errors
    if (errorMessage.includes('request timeout') || errorMessage.includes('etimedout')) {
      return {
        type: 'TIMEOUT_ERROR',
        isNetworkError: true,
        suggestedAction: 'Check network latency or increase timeout'
      };
    }
    
    return {
      type: 'UNKNOWN_ERROR',
      isNetworkError: false,
      suggestedAction: 'Check logs for more details'
    };
  }

  async checkNetworkConnectivity() {
    const connectivityTests = [
      { host: 'api.deepseek.com', port: 443, name: 'DeepSeek API Endpoint' },
      { host: this._providerHost(), port: 443, name: 'Configured LLM Endpoint' }
    ];

    // De-duplicate when the configured base URL is the default endpoint.
    const uniqueTests = connectivityTests.filter(
      (test, index) => connectivityTests.findIndex(t => t.host === test.host) === index
    );

    const results = await Promise.allSettled(
      uniqueTests.map(test => this.testNetworkConnection(test))
    );

    const connectivity = {
      timestamp: new Date().toISOString(),
      tests: results.map((result, index) => ({
        ...uniqueTests[index],
        success: result.status === 'fulfilled' && result.value,
        error: result.status === 'rejected' ? result.reason.message : null
      }))
    };

    logger.info('Network connectivity check completed', connectivity);
    return connectivity;
  }

  async testNetworkConnection({ host, port, name }) {
    return new Promise((resolve, reject) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection timeout to ${host}:${port}`));
      }, 5000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Connection failed to ${host}:${port}: ${error.message}`));
      });

      socket.connect(port, host);
    });
  }

  generateFallbackResponse(text, activeSkill) {
    logger.info('Generating fallback response', { activeSkill });

    const fallbackResponses = {
      'dsa': 'This appears to be a data structures and algorithms problem. Consider breaking it down into smaller components and identifying the appropriate algorithm or data structure to use.',
      'system-design': 'For this system design question, consider scalability, reliability, and the trade-offs between different architectural approaches.',
      'programming': 'This looks like a programming challenge. Focus on understanding the requirements, edge cases, and optimal time/space complexity.',
      'default': 'I can help analyze this content. Please ensure your DeepSeek API key is properly configured for detailed analysis.'
    };

    const response = fallbackResponses[activeSkill] || fallbackResponses.default;
    
    return {
      response,
      metadata: {
        skill: activeSkill,
        processingTime: 0,
        requestId: this.requestCount,
        usedFallback: true
      }
    };
  }

  generateIntelligentFallbackResponse(text, activeSkill) {
    logger.info('Generating intelligent fallback response for transcription', { activeSkill });

    // Simple heuristic to determine if message seems skill-related
    const skillKeywords = {
      'dsa': ['algorithm', 'data structure', 'array', 'tree', 'graph', 'sort', 'search', 'complexity', 'big o'],
      'programming': ['code', 'function', 'variable', 'class', 'method', 'bug', 'debug', 'syntax'],
      'system-design': ['scalability', 'database', 'architecture', 'microservice', 'load balancer', 'cache'],
      'behavioral': ['interview', 'experience', 'situation', 'leadership', 'conflict', 'team'],
      'sales': ['customer', 'deal', 'negotiation', 'price', 'revenue', 'prospect'],
      'presentation': ['slide', 'audience', 'public speaking', 'presentation', 'nervous'],
      'data-science': ['data', 'model', 'machine learning', 'statistics', 'analytics', 'python', 'pandas'],
      'devops': ['deployment', 'ci/cd', 'docker', 'kubernetes', 'infrastructure', 'monitoring'],
      'negotiation': ['negotiate', 'compromise', 'agreement', 'terms', 'conflict resolution']
    };

    const textLower = text.toLowerCase();
    const relevantKeywords = skillKeywords[activeSkill] || [];
    const hasRelevantKeywords = relevantKeywords.some(keyword => textLower.includes(keyword));
    
    // Check for question indicators
    const questionIndicators = ['how', 'what', 'why', 'when', 'where', 'can you', 'could you', 'should i', '?'];
    const seemsLikeQuestion = questionIndicators.some(indicator => textLower.includes(indicator));

    let response;
    if (hasRelevantKeywords || seemsLikeQuestion) {
      response = `I'm having trouble processing that right now, but it sounds like a ${activeSkill} question. Could you rephrase or ask more specifically about what you need help with?`;
    } else {
      response = `Yeah, I'm listening. Ask your question relevant to ${activeSkill}.`;
    }
    
    return {
      response,
      metadata: {
        skill: activeSkill,
        processingTime: 0,
        requestId: this.requestCount,
        usedFallback: true,
        isTranscriptionResponse: true
      }
    };
  }

  async testConnection() {
    if (!this.isInitialized) {
      return { success: false, error: 'Service not initialized' };
    }

    try {
      // First check network connectivity
      const networkCheck = await this.checkNetworkConnectivity();
      const hasNetworkIssues = networkCheck.tests.some(test => !test.success);
      
      if (hasNetworkIssues) {
        logger.warn('Network connectivity issues detected', networkCheck);
      }

      const generationConfig = this.getGenerationConfig({ temperature: 0, maxOutputTokens: 512 });
      const fallbackModels = config.get('llm.deepseek.fallbackModels') || [];
      const modelsToTry = [this.model, ...fallbackModels].filter(Boolean);

      let lastError = null;
      let result = null;
      let usedModel = null;

      for (const modelName of modelsToTry) {
        try {
          const startTime = Date.now();
          // Thinking is disabled for the probe: we only need to confirm the key
          // works and the model answers, and reasoning tokens would otherwise
          // eat the small probe budget and return empty content.
          result = await this.client.createChatCompletion({
            model: modelName,
            messages: [{ role: 'user', content: 'Test connection. Please respond with "OK".' }],
            maxTokens: generationConfig.maxOutputTokens,
            temperature: generationConfig.temperature,
            reasoningEffort: 'none'
          });
          usedModel = modelName;
          const latency = Date.now() - startTime;
          const { text } = this.extractTextFromResult(result);

          logger.info('Connection test successful', {
            response: text,
            latency,
            model: usedModel,
            networkCheck: hasNetworkIssues ? 'issues_detected' : 'healthy'
          });

          return {
            success: true,
            response: text,
            latency,
            model: usedModel,
            networkConnectivity: networkCheck
          };
        } catch (error) {
          lastError = error;
          logger.warn(`Connection test failed for model ${modelName}`, {
            error: error.message,
            statusCode: error.statusCode || null,
            model: modelName
          });

          // Only fall through to the next model when this one is unavailable;
          // an auth or bad-request failure will repeat on every model.
          if (!this._isRetryable(error)) {
            break;
          }
        }
      }

      throw lastError || new Error('Connection test failed on all models');
    } catch (error) {
      const errorAnalysis = this.analyzeError(error);
      logger.error('Connection test failed', {
        error: error.message,
        errorAnalysis
      });

      // The onboarding wizard only surfaces `error`, so map raw API failures
      // to something the user can act on.
      const friendlyError = this._friendlyTestError(error, errorAnalysis);

      return {
        success: false,
        error: friendlyError,
        errorType: errorAnalysis?.type || 'UNKNOWN',
        errorAnalysis,
        networkConnectivity: await this.checkNetworkConnectivity().catch(() => null)
      };
    }
  }

  /**
   * Translate raw API / network errors into something a user can act on.
   */
  _friendlyTestError(error, analysis) {
    const type = analysis?.type;
    const raw = (error?.message || '').toLowerCase();

    if (type === 'AUTH_ERROR' || raw.includes('401') || raw.includes('403') || raw.includes('authentication')) {
      return 'Invalid DeepSeek API key. Check the key at platform.deepseek.com/api_keys.';
    }
    if (type === 'BALANCE_ERROR' || raw.includes('insufficient') || raw.includes('balance')) {
      return 'Your DeepSeek account has insufficient balance. Top up at platform.deepseek.com.';
    }
    if (type === 'RATE_LIMIT_ERROR' || raw.includes('429') || raw.includes('rate limit')) {
      return 'Rate limit reached. Wait a moment and try again.';
    }
    if (type === 'MODEL_ERROR' || raw.includes('model')) {
      return 'The configured model is unavailable. Supported models: deepseek-flash, deepseek-v4-pro.';
    }
    if (type === 'NETWORK_ERROR' || raw.includes('enotfound') || raw.includes('econnrefused')) {
      return 'Cannot reach api.deepseek.com. Check your internet connection, firewall, or VPN settings.';
    }
    if (type === 'TIMEOUT_ERROR') {
      return 'Request timed out. DeepSeek may be slow or unreachable right now.';
    }
    return error?.message || 'Connection failed';
  }

  updateApiKey(newApiKey) {
    process.env.DEEPSEEK_API_KEY = newApiKey;
    this.isInitialized = false;
    this.initializeClient();

    logger.info('DeepSeek API key updated and client reinitialized');
  }

  getStats() {
    const providerConfig = this.providerConfig || {};
    return {
      isInitialized: this.isInitialized,
      // `hasApiKey` / `model` are what the config modal in main-window.js reads;
      // keeping them top-level avoids the modal showing "Not Configured" for a
      // working setup.
      hasApiKey: !!config.getApiKey('DEEPSEEK') && this.isInitialized,
      model: this.model,
      provider: this.provider,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0,
      config: providerConfig
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new LLMService();