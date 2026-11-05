// Derived from Echogarden 3.4.0 (MIT; copyright Rotem Dan). Local changes and licence text: THIRD_PARTY_NOTICES.md.
import {Logger,Timer,chalk,extendDeep,getRawAudioDuration,splitToWords,includesPunctuation,isAllWhitespace,containsInvalidCodepoint,getIntegerRange,clip,yieldToEventLoop,getTopKIndexes,getTokenRepetitionScore,getDeflateCompressionMetricsForString} from './helpers.mjs';
import {indexOfMax,meanOfVector,medianOfVector,softmax,sumAndSumOfSquaresOfVector,sumVector} from './vector-math.mjs';
import {alignDTWWindowed} from './dtw.mjs';
import {medianOf5Filter} from './vector-math.mjs';
export class Whisper { constructor(){this.modelId='tiny';this.isMultiligualModel=true;this.specialTokens=multilingualSpecialTokens;this.randomGen={selectRandomIndexFromDistribution:()=>0};} async initializeIfNeeded(){} async initializeTokenizerIfNeeded(){} async encodeSamples(samples,custom,options){await this.context.encodeSamples(samples,options.threadCount);}
    async recognize(rawAudio, task, language, options, logitFilter, callbacks) {
        await this.initializeIfNeeded(options, callbacks);
        const logger = new Logger(callbacks.logLevel);
        options = extendDeep(defaultWhisperOptions, options);
        options.model = this.modelId;
        if (!options.timestampAccuracy) {
            options.timestampAccuracy = this.defaultTimestampAccuracy;
        }
        if (options.maxTokensPerPart > largestMaximumTokensPerPart) {
            //throw new Error(`The number of tokens per part cannot be greater than ${largestMaximumTokensPerPart}`)
            options.maxTokensPerPart = largestMaximumTokensPerPart;
        }
        const audioSamples = rawAudio.audioChannels[0];
        const sampleRate = rawAudio.sampleRate;
        const prompt = options.prompt;
        const decodeTimestampTokens = options.decodeTimestampTokens;
        const maxAudioSamplesPerPart = sampleRate * (this.audioWindowSeconds ?? 30);
        let previousPartTextTokens = [];
        let timeline = [];
        let allDecodedTokens = [];
        let wrappedLogitFilter;
        if (logitFilter) {
            wrappedLogitFilter = (logits, partDecodedTokens, isFirstPart, isFinalPart) => {
                return logitFilter(logits, [...allDecodedTokens, ...partDecodedTokens], isFirstPart, isFinalPart);
            };
        }
        for (let audioOffset = 0; audioOffset < audioSamples.length;) {
            callbacks?.abortSignal?.throwIfAborted();
            const segmentStartTime = audioOffset / sampleRate;
            await logger.startAsync(`\nPrepare audio part at time position ${segmentStartTime.toFixed(2)}`, undefined, chalk.magentaBright);
            const audioPartSamples = audioSamples.subarray(audioOffset, audioOffset + maxAudioSamplesPerPart);
            const audioPartRawAudio = { audioChannels: [audioPartSamples], sampleRate };
            const audioPartDuration = getRawAudioDuration(audioPartRawAudio);
            logger.end();
            await this.encodeSamples(audioPartSamples, false, options, callbacks);
            await logger.startAsync(`Prepare prompt`);
            const isFirstPart = audioOffset === 0;
            const isFinalPart = audioOffset + maxAudioSamplesPerPart >= audioSamples.length;
            let initialTokens = [];
            if (isFirstPart && prompt) {
                let promptTokens = this.textToTokens(prompt);
                if (promptTokens.length > largestMaximumTokensPerPart) {
                    promptTokens = promptTokens.slice(promptTokens.length - largestMaximumTokensPerPart);
                }
                initialTokens = [this.specialTokens.startOfPromptToken, ...promptTokens];
            }
            else if (options.autoPromptParts && previousPartTextTokens.length > 0) {
                initialTokens = [this.specialTokens.startOfPromptToken, ...previousPartTextTokens];
            }
            initialTokens = [...initialTokens, ...this.getTextStartTokens(language, task, !decodeTimestampTokens)];
            //logger.log(`Initial tokens count: ${initialTokens.length}`)
            logger.end();
            let { decodedTokens: partTokens, decodedTokensConfidence: partTokensConfidence, decodedTokensCrossAttentionQKs: partTokensCrossAttentionQKs, decodedTokensDecodingTime: partTokensDecodingTime, decodedTokensInferenceTime: partTokensInferenceTime, decodedTokensOverheadTime: partTokensOverheadTime, } = await this.decodeTokens(initialTokens, audioPartDuration, isFirstPart, isFinalPart, options, wrappedLogitFilter, callbacks);
            const lastToken = partTokens[partTokens.length - 1];
            const lastTokenIsTimestamp = this.isTimestampToken(lastToken);
            let audioEndOffset;
            if (!isFinalPart && lastTokenIsTimestamp) {
                const timePosition = this.timestampTokenToSeconds(lastToken);
                audioEndOffset = audioOffset + Math.floor(timePosition * sampleRate);
            }
            else {
                audioEndOffset = Math.min(audioOffset + maxAudioSamplesPerPart, audioSamples.length);
            }
            const segmentEndTime = audioEndOffset / sampleRate;
            const segmentFrameCount = this.secondsRangeToFrameCount(segmentStartTime, segmentEndTime);
            await logger.startAsync(`Extract timeline for part (timestamp accuracy: ${options.timestampAccuracy})`);
            // Prepare tokens
            partTokens = partTokens.slice(initialTokens.length);
            partTokensConfidence = partTokensConfidence.slice(initialTokens.length);
            partTokensCrossAttentionQKs = partTokensCrossAttentionQKs.slice(initialTokens.length);
            // Find alignment path using the cross attention query-key tensors
            const alignmentHeadsIndexesToUse = undefined;
            const alignmentPath = await this.findAlignmentPathFromCrossAttentionQKs(partTokensCrossAttentionQKs, partTokens, 0, segmentFrameCount, alignmentHeadsIndexesToUse);
            // Generate timeline from alignment path
            const partTimeline = await this.getTokenTimelineFromAlignmentPath(alignmentPath, partTokens, segmentStartTime, segmentEndTime, partTokensConfidence);
            if (callbacks?.onPart) {
                const partWordTimeline = this.tokenTimelineToWordTimeline(partTimeline, language);
                const partTranscript = this.tokensToText(partTokens);
                callbacks.onPart(partTranscript, partTimeline, partWordTimeline);
            }
            // Add tokens to output
            allDecodedTokens.push(...partTokens);
            timeline.push(...partTimeline);
            // Determine compression ratio for recognized text (normalized to lowercase) of this part
            const compressionRatioForPart = (await getDeflateCompressionMetricsForString(this.tokensToText(partTokens).toLocaleLowerCase())).ratio;
            // If the recognized text isn't too repetitive
            if (compressionRatioForPart < options.repetitionThreshold) {
                // Set current part tokens as the previous part text tokens
                previousPartTextTokens = partTokens.filter(token => this.isTextToken(token));
            }
            else {
                // Otherwise, set previous part tokens to an empty array
                previousPartTextTokens = [];
            }
            audioOffset = audioEndOffset;
            logger.end();
            if (logger.logLevelGreaterOrEqualTo('trace')) {
                const promptProcessingTime = partTokensDecodingTime[0];
                const medianTokenDecodingTime = medianOfVector(partTokensDecodingTime.slice(1));
                const medianTokenInferenceTime = medianOfVector(partTokensInferenceTime.slice(1));
                const medianOverheadTime = medianOfVector(partTokensOverheadTime.slice(1));
                logger.log(`${chalk.blueBright('Context')}: ${initialTokens.length + partTokens.length} tokens (${initialTokens.length} prompt, ${partTokens.length} decoded)\n${chalk.blueBright('Prompt processing time')}: ${promptProcessingTime.toFixed(1)}ms\n${chalk.blueBright('Median token decode time')}: ${medianTokenDecodingTime.toFixed(1)}ms (${medianTokenInferenceTime.toFixed(1)}ms inference, ${medianOverheadTime.toFixed(2)}ms overhead)`, 'trace');
            }
        }
        // Convert token timeline to word timeline
        timeline = this.tokenTimelineToWordTimeline(timeline, language);
        // Convert tokens to transcript
        const transcript = this.tokensToText(allDecodedTokens).trim();
        logger.end();
        return { transcript, timeline, allDecodedTokens };
    }
    async align(rawAudio, transcript, sourceLanguage, task, whisperAlignmentOptions, callbacks) {
        await this.initializeTokenizerIfNeeded(callbacks);
        const logger = new Logger(callbacks.logLevel);
        logger.start(`Tokenize transcript`);
        whisperAlignmentOptions = extendDeep(defaultWhisperAlignmentOptions, whisperAlignmentOptions);
        if (!whisperAlignmentOptions.timestampAccuracy) {
            whisperAlignmentOptions.timestampAccuracy = this.defaultTimestampAccuracy;
        }
        if (whisperAlignmentOptions.maxTokensPerPart > largestMaximumTokensPerPart) {
            //throw new Error(`The number of tokens per part cannot be greater than ${largestMaximumTokensPerPart}`)
            whisperAlignmentOptions.maxTokensPerPart = largestMaximumTokensPerPart;
        }
        const targetLanguage = task === 'transcribe' ? sourceLanguage : 'en';
        let simplifiedTranscript = '';
        {
            const words = (await splitToWords(transcript, targetLanguage)).nonPunctuationWords;
            simplifiedTranscript = words.join(' ');
        }
        // Tokenize the transcript
        const simplifiedTranscriptTokens = this.textToTokens(simplifiedTranscript);
        // Initialize custom logit filter that allows only the transcript tokens to be decoded
        // in order.
        const endOfTextToken = this.specialTokens.endOfTextToken;
        const logitFilter = (logits, decodedTokens, isFirstPart, isFinalPart) => {
            const decodedTextTokens = decodedTokens.filter(token => this.isTextToken(token));
            const nextTokenToDecode = simplifiedTranscriptTokens[decodedTextTokens.length] ?? endOfTextToken;
            const newLogits = logits.map((logit, index) => {
                if (index === nextTokenToDecode) {
                    return logit;
                }
                // If it's the final part, the ent-of-text token logit is set to -Infinity.
                // This will force to force all transcript tokens to be decoded even if the model doesn't
                // recognize them.
                if (!isFinalPart && index === endOfTextToken) {
                    return logit;
                }
                return -Infinity;
            });
            return newLogits;
        };
        // Set options for alignment
        const options = {
            model: this.modelId,
            enableGPU: whisperAlignmentOptions.enableGPU,
            threadCount: whisperAlignmentOptions.threadCount,
            gpuDeviceIndex: whisperAlignmentOptions.gpuDeviceIndex,
            temperature: 0.0,
            prompt: undefined,
            topCandidateCount: 1,
            punctuationThreshold: Infinity,
            autoPromptParts: false,
            maxTokensPerPart: whisperAlignmentOptions.maxTokensPerPart,
            suppressRepetition: false,
            repetitionThreshold: Infinity,
            decodeTimestampTokens: true,
            endTokenThreshold: whisperAlignmentOptions.endTokenThreshold,
            includeEndTokenInCandidates: false,
            timestampAccuracy: whisperAlignmentOptions.timestampAccuracy,
            seed: undefined,
        };
        logger.end();
        // Recognize
        const { timeline, allDecodedTokens } = await this.recognize(rawAudio, task, sourceLanguage, options, logitFilter, callbacks);
        {
            // If not all tokens were decoded, add the remaining ones to the timeline
            const lastKnownWordStartTime = timeline.length > 0 ? timeline[timeline.length - 1].startTime : 0;
            const allDecodedTextTokens = allDecodedTokens.filter(token => this.isTextToken(token));
            while (allDecodedTextTokens.length < simplifiedTranscriptTokens.length) {
                const token = simplifiedTranscriptTokens[allDecodedTextTokens.length];
                const tokenText = this.tokenToText(token);
                allDecodedTextTokens.push(token);
                const newTokenEntry = {
                    type: 'token',
                    text: tokenText,
                    startTime: lastKnownWordStartTime,
                    endTime: lastKnownWordStartTime,
                    id: token,
                    confidence: 0,
                };
                if (tokenText.startsWith(' ') || timeline.length === 0) {
                    timeline.push({
                        type: 'word',
                        text: tokenText.trim(),
                        startTime: lastKnownWordStartTime,
                        endTime: lastKnownWordStartTime,
                        timeline: [newTokenEntry],
                        confidence: 0,
                    });
                }
                else {
                    const lastWordEntry = timeline[timeline.length - 1];
                    lastWordEntry.timeline.push(newTokenEntry);
                    lastWordEntry.text += tokenText;
                }
            }
        }
        return timeline;
    }
    async decodeTokens(initialTokens, audioDuration, isFirstPart, isFinalPart, options, logitFilter, callbacks) {
        const logger = new Logger(callbacks.logLevel);
        await logger.startAsync('Decode text tokens with Whisper decoder model');
        options = extendDeep(defaultWhisperOptions, options);
        // Get token information
        const endOfTextToken = this.specialTokens.endOfTextToken;
        const timestampTokensStart = this.specialTokens.timestampTokensStart;
        const suppressedTextTokens = this.getSuppressedTextTokens();
        const suppressedMetadataTokens = this.getSuppressedMetadataTokens();
        const allowedPunctuationMarks = this.getAllowedPunctuationMarks();
        const spaceToken = this.textToTokens(' ')[0];
        // Initialize variables for decoding loop
        let decodedTokens = initialTokens.slice();
        let decodedTokensTimestampLogits = [];
        let decodedTokensConfidence = [];
        let decodedTokensCrossAttentionQKs = [];
        for (let i = 0; i < decodedTokens.length; i++) {
            decodedTokensTimestampLogits.push(new Float32Array(1501)); // Should the length be 1500 instead?
            decodedTokensConfidence.push(1.0);
            decodedTokensCrossAttentionQKs.push(undefined);
        }
        let lastTimestampTokenIndex = -1;
        let timestampTokenSeenCount = 0;
        let bufferedTokensToPrint = [];
        // Define method to add a token to output
        const addToken = (tokenToAdd, timestampLogits, confidence, crossAttentionQKs) => {
            decodedTokens.push(tokenToAdd);
            decodedTokensTimestampLogits.push(timestampLogits);
            decodedTokensConfidence.push(confidence);
            decodedTokensCrossAttentionQKs.push(crossAttentionQKs);
            if (callbacks?.onToken) {
                callbacks.onToken(tokenToAdd, this.tokenToBytes(tokenToAdd));
            }
        };
        const maxTokensPerPart = Math.min(options.maxTokensPerPart, 448);
        let decodedTokensInferenceTime = [];
        let decodedTokensDecodingTime = [];
        const tokenDecodingTimeTimer = new Timer();
        // Start decoding loop
        for (let decodedTokenCount = 0; decodedTokenCount < maxTokensPerPart; decodedTokenCount++) {
            callbacks?.abortSignal?.throwIfAborted();
            if (decodedTokenCount > 0) {
                decodedTokensDecodingTime.push(tokenDecodingTimeTimer.getElapsedTimeAndRestart());
            }
            const isInitialState = decodedTokens.length === initialTokens.length;
            const atLeastOneTextTokenDecoded = decodedTokens.slice(initialTokens.length).some(token => this.isTextToken(token));
            // Prepare values for decoder
            const tokensToDecode = isInitialState ? decodedTokens : [decodedTokens[decodedTokens.length - 1]];
            const offset = isInitialState ? 0 : decodedTokens.length;
            //// Infer
            const tokenInferenceTimer = new Timer();
            await this.context.decodeTokens(tokensToDecode, offset, options.threadCount);
            decodedTokensInferenceTime.push(tokenInferenceTimer.elapsedTime);
            // Get cross-attention QKs
            //const getCrossAttentionQKsTimer = new Timer()
            const tokenCrossAttentionQKs = await this.context.getCrossAttentionQKs();
            //getCrossAttentionQKsTimer.logAndRestart('getCrossAttentionQKs')
            // Get logits
            const allTokenLogits = this.context.getLogits();
            // Suppress metadata tokens in the suppression set
            for (const suppressedTokenIndex of suppressedMetadataTokens) {
                allTokenLogits[suppressedTokenIndex] = -Infinity;
            }
            if (!atLeastOneTextTokenDecoded) {
                // If in initial state, suppress end-of-text token
                allTokenLogits[endOfTextToken] = -Infinity;
            }
            const timestampTokenLogits = allTokenLogits.subarray(timestampTokensStart);
            const decodeTimestampTokenIfNeeded = () => {
                // Try to decode a timestamp token, if needed
                // If timestamp tokens is disabled in options, don't decode a timestamp
                if (!options.decodeTimestampTokens) {
                    return false;
                }
                // If this is the first token in the part, unconditionally decode a timestamp token
                // for time 0.0
                if (isInitialState) {
                    addToken(timestampTokensStart, timestampTokenLogits, 1.0, tokenCrossAttentionQKs);
                    return true;
                }
                const previousTokenWasTimestamp = this.isTimestampToken(decodedTokens[decodedTokens.length - 1]);
                const secondPreviousTokenWasTimestamp = this.isTimestampToken(decodedTokens[decodedTokens.length - 2]);
                // If there are two successive timestamp tokens decoded, or the previous timestamp was the first token,
                // don't decode a timestamp
                if (previousTokenWasTimestamp &&
                    ((decodedTokens.length === initialTokens.length + 1) || secondPreviousTokenWasTimestamp)) {
                    return false;
                }
                // Derive token probabilities
                const allTokenProbabilities = softmax(allTokenLogits, 1.0);
                const nonTimestampTokenProbs = allTokenProbabilities.subarray(0, timestampTokensStart);
                // Find highest probability non-timestamp token
                const indexOfMaxNonTimestampProb = indexOfMax(nonTimestampTokenProbs);
                const valueOfMaxNonTimestampProb = nonTimestampTokenProbs[indexOfMaxNonTimestampProb];
                const valueOfMaxNonTimestampLogProb = Math.log(valueOfMaxNonTimestampProb);
                // Find highest probability timestamp token
                const timestampTokenProbs = allTokenProbabilities.subarray(timestampTokensStart);
                const indexOfMaxTimestampProb = indexOfMax(timestampTokenProbs);
                // Compute the log of the sum of probabilities of the timestamp tokens
                const sumOfTimestampTokenProbs = sumVector(timestampTokenProbs);
                const logSumOfTimestampTokenProbs = Math.log(sumOfTimestampTokenProbs);
                // If the sum isn't greater than the log probability of the highest non-timestamp token,
                // don't decode a timestamp
                if (logSumOfTimestampTokenProbs <= valueOfMaxNonTimestampLogProb) {
                    return false;
                }
                // Decode a timestamp token
                timestampTokenSeenCount += 1;
                if (previousTokenWasTimestamp) {
                    // If previously decoded token was a timestamp token, repeat it
                    const previousToken = decodedTokens[decodedTokens.length - 1];
                    const previousTokenTimestampLogits = decodedTokensTimestampLogits[decodedTokensTimestampLogits.length - 1];
                    const previousTokenConfidence = decodedTokensConfidence[decodedTokensConfidence.length - 1];
                    addToken(previousToken, previousTokenTimestampLogits, previousTokenConfidence, tokenCrossAttentionQKs);
                    lastTimestampTokenIndex = decodedTokens.length;
                }
                else {
                    // Otherwise decode the highest probability timestamp
                    const timestampToken = timestampTokensStart + indexOfMaxTimestampProb;
                    const confidence = allTokenProbabilities[timestampToken];
                    addToken(timestampToken, timestampTokenLogits, confidence, tokenCrossAttentionQKs);
                }
                return true;
            };
            // Call the method to decode timestamp token if needed
            const timestampTokenDecoded = decodeTimestampTokenIfNeeded();
            if (timestampTokenDecoded) {
                await yieldToEventLoop();
                continue;
            }
            // Decode a non-timestamp token
            let nonTimestampTokenLogits = allTokenLogits.slice(0, timestampTokensStart);
            let shouldDecodeEndfOfTextToken = false;
            // If at least one text token was decoded, and the end-of-text token's probability is
            // sufficiently higher than the second highest ranked token, then accept end-of-text
            if (atLeastOneTextTokenDecoded) {
                const endOfTextTokenLogit = nonTimestampTokenLogits[endOfTextToken];
                const otherTokensLogits = nonTimestampTokenLogits.slice();
                otherTokensLogits[endOfTextToken] = -Infinity;
                const indexOfMaximumOtherTokenLogit = indexOfMax(otherTokensLogits);
                const maximumOtherTokenLogit = nonTimestampTokenLogits[indexOfMaximumOtherTokenLogit];
                const endProbabilities = softmax([endOfTextTokenLogit, maximumOtherTokenLogit], 1.0);
                if (endProbabilities[0] > options.endTokenThreshold) {
                    shouldDecodeEndfOfTextToken = true;
                }
            }
            if (logitFilter) {
                // Apply custom logit filter function if given
                nonTimestampTokenLogits = logitFilter(nonTimestampTokenLogits, decodedTokens, isFirstPart, isFinalPart);
                // If the custom filter set the end-of-text token to be Infinity, or -Infinity,
                // then override any previous decision and accept or reject it, respectively
                if (nonTimestampTokenLogits[endOfTextToken] === Infinity) {
                    shouldDecodeEndfOfTextToken = true;
                }
                else if (nonTimestampTokenLogits[endOfTextToken] === -Infinity) {
                    shouldDecodeEndfOfTextToken = false;
                }
                // If filter caused all word token logits to be -Infinity, then there is no
                // other token to decode. Fall back to accept end-of-text
                if (nonTimestampTokenLogits.subarray(0, endOfTextToken).every(logit => logit === -Infinity)) {
                    shouldDecodeEndfOfTextToken = true;
                }
            }
            else {
                // Otherwise, suppress text tokens in the suppression set
                for (const suppressedTokenIndex of suppressedTextTokens) {
                    nonTimestampTokenLogits[suppressedTokenIndex] = -Infinity;
                }
                // Suppress the space token if at initial state
                if (isInitialState) {
                    nonTimestampTokenLogits[spaceToken] = -Infinity;
                }
            }
            // If end-of-text token should be decoded, then add it and break
            // out of the loop
            if (shouldDecodeEndfOfTextToken) {
                addToken(endOfTextToken, timestampTokenLogits, 1.0, tokenCrossAttentionQKs);
                break;
            }
            // Suppress end-of-text token if it shouldn't be included in candidates
            if (!options.includeEndTokenInCandidates) {
                nonTimestampTokenLogits[endOfTextToken] = -Infinity;
            }
            // Find top candidates
            const sortedTopCandidateTokens = getTopKIndexes(nonTimestampTokenLogits, options.topCandidateCount, true);
            let topCandidates = Array.from(sortedTopCandidateTokens).map(token => {
                const logit = nonTimestampTokenLogits[token];
                return {
                    token,
                    logit,
                    text: this.tokenToText(token, true)
                };
            });
            // Apply repetition suppression if enabled
            if (options.suppressRepetition) {
                // Using some hardcoded constants, for now:
                const tokenWindowSize = 30;
                const thresholdMatchLength = 4;
                const thresholdCycleRepetitionCount = 3;
                const filteredCandidates = [];
                for (const candidate of topCandidates) {
                    const decodedTextTokens = decodedTokens.filter(token => this.isTextToken(token));
                    const lastDecodedTextTokens = decodedTextTokens
                        .slice(Math.max(decodedTextTokens.length - tokenWindowSize, 0))
                        .reverse();
                    const { longestMatchLength, longestCycleRepetitionCount } = getTokenRepetitionScore([candidate.token, ...lastDecodedTextTokens]);
                    if (longestMatchLength >= thresholdMatchLength || longestCycleRepetitionCount >= thresholdCycleRepetitionCount) {
                        continue;
                    }
                    filteredCandidates.push(candidate);
                }
                // If all candidates have been filtered out, accept an end-of-text token
                if (filteredCandidates.length === 0) {
                    filteredCandidates.push({
                        token: endOfTextToken,
                        logit: Infinity,
                        text: this.tokenToText(endOfTextToken, true)
                    });
                }
                topCandidates = filteredCandidates;
            }
            // Compute top candidate probabilities
            const topCandidateProbabilities = softmax(topCandidates.map(a => a.logit), options.temperature);
            // Find highest ranking punctuation token
            const rankOfPromisingPunctuationToken = topCandidates.findIndex((entry, index) => {
                const tokenText = this.tokenToText(entry.token).trim();
                const isPunctuationToken = allowedPunctuationMarks.includes(tokenText);
                if (!isPunctuationToken) {
                    return false;
                }
                const tokenProb = topCandidateProbabilities[index];
                return tokenProb >= options.punctuationThreshold;
            });
            // Find rank of space token
            let rankOfSpaceToken = topCandidates.findIndex(candidate => candidate.token === spaceToken);
            if (rankOfSpaceToken < 0) {
                rankOfSpaceToken = Infinity;
            }
            // Choose token
            let chosenCandidateRank;
            // Select a high-ranking punctuation token if found, and it has
            // a rank higher than the space token,
            if (rankOfPromisingPunctuationToken >= 0 &&
                rankOfPromisingPunctuationToken < rankOfSpaceToken) {
                chosenCandidateRank = rankOfPromisingPunctuationToken;
            }
            else {
                // Otherwise, select randomly from top k distribution
                chosenCandidateRank = this.randomGen.selectRandomIndexFromDistribution(topCandidateProbabilities);
            }
            // Add chosen token
            const chosenToken = topCandidates[chosenCandidateRank].token;
            const chosenTokenConfidence = topCandidateProbabilities[chosenCandidateRank];
            addToken(chosenToken, timestampTokenLogits, chosenTokenConfidence, tokenCrossAttentionQKs);
            // If chosen token is the end-of-text token, break
            if (chosenToken === endOfTextToken) {
                break;
            }
            // Print token if needed
            if (this.isTextToken(chosenToken)) {
                bufferedTokensToPrint.push(chosenToken);
                let textToPrint = this.tokensToText(bufferedTokensToPrint);
                // If the decoded text is valid, print it
                if (!containsInvalidCodepoint(textToPrint)) {
                    if (isFirstPart && decodedTokens.every(token => this.isMetadataToken(token))) {
                        textToPrint = textToPrint.trimStart();
                    }
                    logger.write(textToPrint);
                    bufferedTokensToPrint = [];
                }
            }
            await yieldToEventLoop();
        }
        if (decodedTokensDecodingTime.length === decodedTokensInferenceTime.length - 1) {
            decodedTokensDecodingTime.push(tokenDecodingTimeTimer.getElapsedTimeAndRestart());
        }
        // If at least two timestamp tokens were decoded and it's not the final part,
        // truncate up to the last timestamp token
        if (timestampTokenSeenCount >= 2 && !isFinalPart) {
            const sliceEndTokenIndex = lastTimestampTokenIndex;
            decodedTokens = decodedTokens.slice(0, sliceEndTokenIndex);
            decodedTokensTimestampLogits = decodedTokensTimestampLogits.slice(0, sliceEndTokenIndex);
            decodedTokensConfidence = decodedTokensConfidence.slice(0, sliceEndTokenIndex);
            decodedTokensCrossAttentionQKs = decodedTokensCrossAttentionQKs.slice(0, sliceEndTokenIndex);
            decodedTokensDecodingTime = decodedTokensDecodingTime.slice(0, sliceEndTokenIndex);
            decodedTokensInferenceTime = decodedTokensInferenceTime.slice(0, sliceEndTokenIndex);
        }
        const decodedTokensOverheadTime = decodedTokensDecodingTime.map((time, index) => time - decodedTokensInferenceTime[index]);
        logger.write('\n');
        logger.end();
        // Return the decoded tokens
        return {
            decodedTokens,
            decodedTokensTimestampLogits,
            decodedTokensConfidence,
            decodedTokensCrossAttentionQKs,
            decodedTokensDecodingTime,
            decodedTokensInferenceTime,
            decodedTokensOverheadTime,
        };
    }
    tokenTimelineToWordTimeline(tokenTimeline, language) {
        function isSeparatorCharacter(char) {
            const nonSeparatingPunctuation = [`'`, `-`, `.`, `·`, `•`];
            if (nonSeparatingPunctuation.includes(char)) {
                return false;
            }
            return isAllWhitespace(char) || includesPunctuation(char);
        }
        function startsWithSeparatorCharacter(text) {
            return isSeparatorCharacter(text[0]);
        }
        function endsWithSeparatorCharacter(text) {
            return isSeparatorCharacter(text[text.length - 1]);
        }
        if (language !== 'zh' && language !== 'ja') {
            tokenTimeline = tokenTimeline.filter(entry => this.isTextToken(entry.id));
        }
        const resultTimeline = [];
        let groups = [];
        for (let tokenIndex = 0; tokenIndex < tokenTimeline.length; tokenIndex++) {
            const entry = tokenTimeline[tokenIndex];
            const previousEntry = tokenIndex > 0 ? tokenTimeline[tokenIndex - 1] : undefined;
            const text = entry.text;
            const previousEntryText = previousEntry?.text;
            if (groups.length === 0 ||
                text === '' ||
                startsWithSeparatorCharacter(text) ||
                (previousEntryText != null && endsWithSeparatorCharacter(previousEntryText))) {
                groups.push([entry]);
            }
            else {
                groups[groups.length - 1].push(entry);
            }
        }
        {
            const splitGroups = [];
            for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
                const group = groups[groupIndex];
                const nextGroup = groups[groupIndex + 1];
                if (group.length > 1 &&
                    group[group.length - 1].text === '.' &&
                    (!nextGroup || [' ', '['].includes(nextGroup[0].text[0]))) {
                    splitGroups.push(group.slice(0, group.length - 1));
                    splitGroups.push(group.slice(group.length - 1));
                }
                else {
                    splitGroups.push(group);
                }
            }
            groups = splitGroups;
        }
        for (const group of groups) {
            let groupText = this.tokensToText(group.map(entry => entry.id));
            if (groupText === '') {
                continue;
            }
            const startTime = group[0].startTime;
            const endTime = group[group.length - 1].endTime;
            let confidence = undefined;
            if (group[0].confidence != null) {
                confidence = meanOfVector(group.map(entry => entry.confidence));
            }
            const newEntry = {
                type: 'word',
                text: groupText.trim(),
                startTime,
                endTime,
                confidence,
                timeline: group,
            };
            resultTimeline.push(newEntry);
        }
        return resultTimeline;
    }
    async getTokenTimelineFromAlignmentPath(alignmentPath, tokens, startTimeOffset, endTimeOffset, tokensConfidence, correctionAmount = 0.0) {
        if (alignmentPath.length === 0) {
            return [];
        }
        const tokenTimeline = [];
        for (let pathIndex = 0; pathIndex < alignmentPath.length; pathIndex++) {
            if (pathIndex !== 0 && alignmentPath[pathIndex].source === alignmentPath[pathIndex - 1].source) {
                continue;
            }
            const tokenMappingEntry = alignmentPath[pathIndex];
            const tokenIndex = tokenMappingEntry.source;
            const token = tokens[tokenIndex];
            const tokenConfidence = tokensConfidence ? tokensConfidence[tokenIndex] : undefined;
            const tokenText = this.tokenToText(token, true);
            let startTime = startTimeOffset + (tokenMappingEntry.dest * 0.02);
            startTime = Math.max(startTime + correctionAmount, startTimeOffset);
            if (tokenTimeline.length > 0) {
                tokenTimeline[tokenTimeline.length - 1].endTime = startTime;
            }
            tokenTimeline.push({
                type: 'token',
                text: tokenText,
                id: token,
                startTime,
                endTime: -1,
                confidence: tokenConfidence
            });
        }
        if (tokenTimeline.length > 0) {
            tokenTimeline[tokenTimeline.length - 1].endTime = endTimeOffset;
        }
        return tokenTimeline;
    }
    async findAlignmentPathFromCrossAttentionQKs(crossAttentionQKs, tokens, partStartFrameIndex, partEndFrameIndex, alignmentHeadsIndexesToUse) {
        const partFrameCount = partEndFrameIndex - partStartFrameIndex;
        if (partFrameCount === 0 || tokens.length === 0 || crossAttentionQKs.length === 0 || crossAttentionQKs[0].data.length === 0) {
            return [];
        }
        // crossAttentionQKs internal dimensions: [heads, tokens = 1, frames]
        const tokenCount = crossAttentionQKs.length;
        const headCount = Number(crossAttentionQKs[0].dimensions[0]);
        const frameCount = Number(crossAttentionQKs[0].dimensions[2]);
        if (!alignmentHeadsIndexesToUse) {
            alignmentHeadsIndexesToUse = getIntegerRange(0, headCount);
        }
        // Initialize attention head arrays
        const attentionHeads = []; // dimensions: [heads, tokens, frames]
        for (const headIndex of alignmentHeadsIndexesToUse) {
            const head = [];
            const startIndexInBuffer = headIndex * frameCount;
            const endIndexInBuffer = startIndexInBuffer + partFrameCount;
            for (let tokenIndex = 0; tokenIndex < tokenCount; tokenIndex++) {
                const data = crossAttentionQKs[tokenIndex].data.subarray(startIndexInBuffer, endIndexInBuffer);
                head.push(data);
            }
            attentionHeads.push(head);
        }
        // Initialize settings
        const applySoftmax = true;
        const normalize = true;
        const applyMedianFilter = true;
        const anchorTimestampTokens = false;
        const softmaxTemperature = 1.0;
        // Apply softmax to each token's frames, if enabled
        if (applySoftmax) {
            for (const head of attentionHeads) {
                for (let tokenIndex = 0; tokenIndex < tokenCount; tokenIndex++) {
                    head[tokenIndex] = softmax(head[tokenIndex], softmaxTemperature);
                }
            }
        }
        // Normalize all weights in each individual head, if enabled
        if (normalize) {
            for (const head of attentionHeads) {
                let sumOfAllWeightsForHead = 0;
                let sumOfAllSquaredWeightsForHead = 0;
                let countOfAllWeightsForHead = 0;
                for (const tokenFrames of head) {
                    const { sum, sumOfSquares } = sumAndSumOfSquaresOfVector(tokenFrames);
                    sumOfAllWeightsForHead += sum;
                    sumOfAllSquaredWeightsForHead += sumOfSquares;
                    countOfAllWeightsForHead += tokenFrames.length;
                }
                const meanOfAllWeightsForHead = sumOfAllWeightsForHead / countOfAllWeightsForHead;
                const varianceOfAllWeightsForHead = sumOfAllSquaredWeightsForHead / countOfAllWeightsForHead;
                const stdDeviationOfAllWeightsForHead = Math.sqrt(varianceOfAllWeightsForHead);
                const stdDeviationReciprocal = 1.0 / (stdDeviationOfAllWeightsForHead + 1e-10);
                for (const tokenFrames of head) {
                    for (let frameIndex = 0; frameIndex < tokenFrames.length; frameIndex++) {
                        tokenFrames[frameIndex] = (tokenFrames[frameIndex] - meanOfAllWeightsForHead) * stdDeviationReciprocal;
                    }
                }
            }
        }
        // Apply median filter to each token's frames, if enabled
        if (applyMedianFilter) {
            for (const head of attentionHeads) {
                for (let tokenIndex = 0; tokenIndex < tokenCount; tokenIndex++) {
                    head[tokenIndex] = medianOf5Filter(head[tokenIndex]);
                }
            }
        }
        // Compute the mean of the selected attention heads for each frame
        const frameMeansForToken = [];
        for (let tokenIndex = 0; tokenIndex < tokenCount; tokenIndex++) {
            const meansForFrames = new Float32Array(partFrameCount);
            for (let frameIndex = 0; frameIndex < partFrameCount; frameIndex++) {
                let sum = 0;
                for (const head of attentionHeads) {
                    sum += head[tokenIndex][frameIndex];
                }
                const frameMean = sum / attentionHeads.length;
                meansForFrames[frameIndex] = frameMean;
            }
            frameMeansForToken.push(meansForFrames);
        }
        // Anchor timestamp tokens timestamps to their original values, if enabled
        if (anchorTimestampTokens) {
            const timestampTokensStart = this.specialTokens.timestampTokensStart;
            for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
                const token = tokens[tokenIndex];
                if (this.isTimestampToken(token)) {
                    let timestampFrame = token - timestampTokensStart;
                    timestampFrame = clip(timestampFrame, partStartFrameIndex, partEndFrameIndex - 1);
                    frameMeansForToken[tokenIndex][timestampFrame] = 100;
                }
            }
        }
        // Perform DTW to align tokens indexes to frame indexes
        const tokenIndexes = getIntegerRange(0, tokenCount);
        const frameIndexes = getIntegerRange(0, partFrameCount);
        const positionPenalty = this.alignmentPositionPenalty ?? 0;
        let { path } = alignDTWWindowed(tokenIndexes, frameIndexes, (tokenIndex, frameIndex) => {
            const cost = -frameMeansForToken[tokenIndex][frameIndex];
            if (!positionPenalty) return cost;
            const distance = tokenIndex / Math.max(1,tokenCount-1) - frameIndex / Math.max(1,partFrameCount-1);
            return cost + positionPenalty * distance * distance;
        }, partFrameCount);
        path = path.map(entry => ({ source: entry.source, dest: partStartFrameIndex + entry.dest }));
        return path;
    }
    getTextStartTokens(language, task, disableTimestamps = false) {
        const startOfTextToken = this.specialTokens.startOfTextToken;
        let tokens;
        if (this.isMultiligualModel) {
            const languageToken = this.specialTokens.languageTokensStart + languageIdLookup[language];
            const taskToken = task === 'translate' ? this.specialTokens.translateTaskToken : this.specialTokens.transcribeTaskToken;
            tokens = [startOfTextToken, languageToken, taskToken];
        }
        else {
            tokens = [startOfTextToken];
        }
        if (disableTimestamps) {
            tokens.push(this.specialTokens.noTimestampsToken);
        }
        return tokens;
    }
    tokenToText(token, includeMetadataTokens = false) {
        return this.tokensToText([token], includeMetadataTokens);
    }
    tokenToBytes(token) {
        return this.tiktoken.decode_single_token_bytes(token);
    }
    tokensToText(tokens, includeMetadataTokens = false) {
        tokens.forEach(token => this.assertIsValidToken(token));
        if (includeMetadataTokens === false) {
            tokens = tokens.filter(token => this.isTextToken(token));
        }
        if (tokens.length === 0) {
            return '';
        }
        try {
            const decodedBytes = this.tiktoken.decode(new Uint32Array(tokens));
            const textDecoder = new TextDecoder();
            const decodedString = textDecoder.decode(decodedBytes);
            return decodedString;
        }
        catch {
            return '[TOKENIZER_FAILED]';
        }
    }
    textToTokens(text) {
        return Array.from(this.tiktoken.encode(text));
    }
    isTextToken(token) {
        return token < this.specialTokens.endOfTextToken;
    }
    isMetadataToken(token) {
        return token >= this.specialTokens.endOfTextToken;
    }
    isTimestampToken(token) {
        return token >= this.specialTokens.timestampTokensStart;
    }
    isNonTimestampToken(token) {
        return token < this.specialTokens.timestampTokensStart;
    }
    timestampTokenToSeconds(timestampToken) {
        this.assertIsValidToken(timestampToken);
        if (this.isNonTimestampToken(timestampToken)) {
            throw new Error(`Invalid timestamp token: ${timestampToken}`);
        }
        let seconds = (timestampToken - this.specialTokens.timestampTokensStart) * 0.02;
        seconds = clip(seconds, 0.0, 30.0);
        return seconds;
    }
    isValidToken(token) {
        //return token < this.tokenConfig.timestampTokensEnd
        return token <= this.specialTokens.timestampTokensEnd;
    }
    assertIsValidToken(token) {
        if (!this.isValidToken(token)) {
            throw new Error(`Invalid token: ${token}`);
        }
    }
    secondsToFrame(seconds) {
        return Math.floor((seconds + 1e-9) / 0.02);
    }
    secondsRangeToFrameCount(startSeconds, endSeconds) {
        if (startSeconds > endSeconds) {
            throw new Error(`Invalid range: ${startSeconds} > ${endSeconds}`);
        }
        return this.secondsToFrame(endSeconds - startSeconds);
    }
    get isEnglishOnlyModel() {
        return this.isMultiligualModel === false;
    }
    get isLargeV3Model() {
        return this.modelId.startsWith('large-v3');
    }
    get melBandCount() {
        return this.isLargeV3Model ? 128 : 80;
    }
    get defaultTimestampAccuracy() {
        if (this.modelId.startsWith('tiny') || this.modelId.startsWith('base')) {
            return 'high';
        }
        else {
            return 'medium';
        }
    }
    getSuppressedTextTokens() {
        const allowedPunctuationMarks = this.getAllowedPunctuationMarks();
        const nonWordTokensData = this.getWordTokenData().nonWordTokenData;
        const suppressedTextTokens = nonWordTokensData
            .filter(entry => !allowedPunctuationMarks.includes(entry.text))
            .map(entry => entry.id);
        return suppressedTextTokens;
    }
    getSuppressedMetadataTokens() {
        if (this.isMultiligualModel) {
            return [50256, ...getIntegerRange(50258, 50364)];
        }
        else {
            return [...getIntegerRange(50257, 50363)];
        }
    }
    getAllowedPunctuationMarks() {
        const generalPunctuation = [`'`, ',', '.', '?', '!'];
        let allowedPunctuation;
        if (this.isMultiligualModel) {
            const spanish = ['¿', '¡'];
            const chinese = ['、', '，', '。', '？', '！'];
            const arabic = ['،', '؟'];
            const various = ['·', '•', '・'];
            allowedPunctuation = [...generalPunctuation, ...arabic, ...chinese, ...spanish, ...various];
        }
        else {
            allowedPunctuation = generalPunctuation;
        }
        return allowedPunctuation;
    }
    getWordTokenData() {
        const wordTokenData = [];
        const nonWordTokenData = [];
        for (let i = 0; i < this.specialTokens.endOfTextToken; i++) {
            const tokenText = this.tokenToText(i, false);
            const isNonWordToken = /^[\s\p{Punctuation}\p{Symbol}]+$/u.test(tokenText);
            const containsInvalidUTF8 = containsInvalidCodepoint(tokenText);
            if (isNonWordToken && (this.isEnglishOnlyModel || !containsInvalidUTF8)) {
                nonWordTokenData.push({
                    id: i,
                    text: tokenText,
                });
            }
            else {
                wordTokenData.push({
                    id: i,
                    text: tokenText,
                });
            }
        }
        return { wordTokenData, nonWordTokenData };
    }
}
const languageIdLookup = {
    'en': 0,
    'zh': 1,
    'de': 2,
    'es': 3,
    'ru': 4,
    'ko': 5,
    'fr': 6,
    'ja': 7,
    'pt': 8,
    'tr': 9,
    'pl': 10,
    'ca': 11,
    'nl': 12,
    'ar': 13,
    'sv': 14,
    'it': 15,
    'id': 16,
    'hi': 17,
    'fi': 18,
    'vi': 19,
    'iw': 20,
    'uk': 21,
    'el': 22,
    'ms': 23,
    'cs': 24,
    'ro': 25,
    'da': 26,
    'hu': 27,
    'ta': 28,
    'no': 29,
    'th': 30,
    'ur': 31,
    'hr': 32,
    'bg': 33,
    'lt': 34,
    'la': 35,
    'mi': 36,
    'ml': 37,
    'cy': 38,
    'sk': 39,
    'te': 40,
    'fa': 41,
    'lv': 42,
    'bn': 43,
    'sr': 44,
    'az': 45,
    'sl': 46,
    'kn': 47,
    'et': 48,
    'mk': 49,
    'br': 50,
    'eu': 51,
    'is': 52,
    'hy': 53,
    'ne': 54,
    'mn': 55,
    'bs': 56,
    'kk': 57,
    'sq': 58,
    'sw': 59,
    'gl': 60,
    'mr': 61,
    'pa': 62,
    'si': 63,
    'km': 64,
    'sn': 65,
    'yo': 66,
    'so': 67,
    'af': 68,
    'oc': 69,
    'ka': 70,
    'be': 71,
    'tg': 72,
    'sd': 73,
    'gu': 74,
    'am': 75,
    'yi': 76,
    'lo': 77,
    'uz': 78,
    'fo': 79,
    'ht': 80,
    'ps': 81,
    'tk': 82,
    'nn': 83,
    'mt': 84,
    'sa': 85,
    'lb': 86,
    'my': 87,
    'bo': 88,
    'tl': 89,
    'mg': 90,
    'as': 91,
    'tt': 92,
    'haw': 93,
    'ln': 94,
    'ha': 95,
    'ba': 96,
    'jw': 97,
    'su': 98,
    //'yue': 99
};
const multilingualSpecialTokens = {
    endOfTextToken: 50257,
    startOfTextToken: 50258,
    languageTokensStart: 50259,
    languageTokensEnd: 50358,
    translateTaskToken: 50358,
    transcribeTaskToken: 50359,
    startOfPromptToken: 50361,
    nonSpeechToken: 50362,
    noTimestampsToken: 50363,
    timestampTokensStart: 50364,
    timestampTokensEnd: 50364 + 1501,
};
const largestMaximumTokensPerPart = 220;
export const defaultWhisperOptions = {
    model: undefined,
    enableGPU: false,
    threadCount: 4,
    gpuDeviceIndex: 0,
    temperature: 0.1,
    prompt: undefined,
    topCandidateCount: 5,
    punctuationThreshold: 0.2,
    autoPromptParts: true,
    maxTokensPerPart: largestMaximumTokensPerPart,
    suppressRepetition: true,
    repetitionThreshold: 2.4,
    decodeTimestampTokens: true,
    endTokenThreshold: 0.9,
    includeEndTokenInCandidates: true,
    timestampAccuracy: undefined,
    seed: undefined,
};
export const defaultWhisperAlignmentOptions = {
    model: undefined,
    enableGPU: false,
    threadCount: 4,
    gpuDeviceIndex: 0,
    endTokenThreshold: 0.9,
    maxTokensPerPart: largestMaximumTokensPerPart,
    timestampAccuracy: undefined,
};
//# sourceMappingURL=WhisperSTT.js.map
