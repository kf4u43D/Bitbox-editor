/**
 * BITBOXER - Sample Editor
 * 
 * Visual waveform editor with playback and draggable markers
 * Mode-aware display (Sample/Clip/Slicer/Granular)
 */

// ============================================
// CONSTANTS
// ============================================
const AUTODETECT_DEBOUNCE_MS = 500;

// ============================================
// WAVEFORM RENDERER
// ============================================
class WaveformRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.waveformData = null;
        this.zoom = 1; // 1 = full view, >1 = zoomed in
        this.scrollSample = 0;  // INTEGER sample offset (absolute position)
        this.width = 0;
        this.height = 0;
    }

    getThemeColors() {
        const rootStyles = getComputedStyle(document.documentElement);
        return {
            background: rootStyles.getPropertyValue('--color-bg-primary').trim() || '#1a1614',
            waveform: rootStyles.getPropertyValue('--waveform-line').trim() || '#ffa600',
            center: rootStyles.getPropertyValue('--waveform-center').trim() || '#4a4038',
            text: rootStyles.getPropertyValue('--color-text-secondary').trim() || '#d0c2b9',
            markerSample: rootStyles.getPropertyValue('--marker-sample').trim() || '#ff6b6b',
            markerLoop: rootStyles.getPropertyValue('--marker-loop').trim() || '#7fb6ff',
            markerSlice: rootStyles.getPropertyValue('--marker-slice').trim() || '#8fe388',
            overlayAccent: rootStyles.getPropertyValue('--overlay-accent').trim() || '#ffb347',
            beatGrid: rootStyles.getPropertyValue('--beat-grid').trim() || 'rgba(163, 90, 45, 0.5)',
            beatGridSubtle: rootStyles.getPropertyValue('--beat-grid-subtle').trim() || 'rgba(163, 90, 45, 0.2)',
            scrollbarTrack: rootStyles.getPropertyValue('--scrollbar-track').trim() || '#241d1a',
            scrollbarThumb: rootStyles.getPropertyValue('--scrollbar-thumb').trim() || '#8d4d26',
            scrollbarThumbHover: rootStyles.getPropertyValue('--scrollbar-thumb-hover').trim() || '#b36432',
            border: rootStyles.getPropertyValue('--color-border').trim() || '#4a4038'
        };
    }

    setWaveformData(audioBuffer) {
        const channels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length;
        const sampleRate = audioBuffer.sampleRate;
        
        this.waveformData = {
            channels: channels,
            length: length,
            sampleRate: sampleRate,
            channelData: []
        };

        // Store channel data
        for (let i = 0; i < channels; i++) {
            this.waveformData.channelData.push(audioBuffer.getChannelData(i));
        }

        // Reset scroll to start when loading new sample
        this.scrollSample = 0;
        this.zoom = 1;
        
        this.render();
    }

    resize() {
        const container = this.canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        
        this.width = container.offsetWidth;
        this.height = 200;
        
        // Only resize if container has valid dimensions
        if (this.width <= 0 || this.height <= 0) {
            console.warn('Canvas container has zero size, deferring resize');
            return;
        }
        
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
        
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        
        this.render();
    }

    render() {
        if (!this.waveformData || this.width <= 0 || this.height <= 0) return;

        const { ctx, width, height, waveformData, zoom, scrollSample } = this;
        const { channels, length, channelData } = waveformData;
        const themeColors = this.getThemeColors();

        // Clear canvas
        ctx.fillStyle = themeColors.background;
        ctx.fillRect(0, 0, width, height);

        // Calculate visible sample range - INTEGER MATH
        const visibleSamples = Math.max(1, Math.floor(length / zoom));
        const maxScroll = Math.max(0, length - visibleSamples);
        const clampedScrollSample = Math.max(0, Math.min(maxScroll, scrollSample));
        
        const startSample = clampedScrollSample;
        const endSample = Math.min(length, startSample + visibleSamples);
        
        // CRITICAL FIX: Use the SAME math as sampleToX() and xToSample()
        // This ensures perfect alignment between waveform and markers
        // We render exactly what the coordinate functions expect
        
        const channelHeight = height / channels;

        // Draw each channel
        for (let ch = 0; ch < channels; ch++) {
            const data = channelData[ch];
            const yOffset = ch * channelHeight + channelHeight / 2;

            ctx.strokeStyle = themeColors.waveform;
            ctx.lineWidth = 1;
            ctx.beginPath();

            for (let x = 0; x < width; x++) {
                // Use EXACT inverse of sampleToX() calculation
                // sampleToX formula: pixelPos = (offsetFromScroll / visibleSamples) * width
                // Inverse: offsetFromScroll = (x / width) * visibleSamples
                const ratio = x / width;
                const sampleOffset = ratio * visibleSamples;
                const sampleIdxFloat = startSample + sampleOffset;

                // Get the sample index (floor for starting point)
                const sampleIdx = Math.floor(sampleIdxFloat);

                // Calculate how many samples this pixel represents
                const nextRatio = (x + 1) / width;
                const nextSampleOffset = nextRatio * visibleSamples;
                const nextSampleIdxFloat = startSample + nextSampleOffset;
                const sampleEnd = Math.min(length, Math.ceil(nextSampleIdxFloat));

                // Ensure we always sample at least one sample
                const actualEnd = Math.max(sampleIdx + 1, sampleEnd);

                // Find min/max in this pixel's sample range
                let min = 1, max = -1;
                for (let i = sampleIdx; i < actualEnd && i < length; i++) {
                    const val = data[i];
                    if (val < min) min = val;
                    if (val > max) max = val;
                }

                const y1 = yOffset + min * (channelHeight / 2) * 0.9;
                const y2 = yOffset + max * (channelHeight / 2) * 0.9;

                if (x === 0) {
                    ctx.moveTo(x, y1);
                } else {
                    ctx.lineTo(x, y1);
                }
                ctx.lineTo(x, y2);
            }

            ctx.stroke();

            // Draw center line
            ctx.strokeStyle = themeColors.center;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, yOffset);
            ctx.lineTo(width, yOffset);
            ctx.stroke();

            // Draw channel label
            ctx.fillStyle = themeColors.text;
            ctx.font = '10px monospace';
            ctx.fillText(channels === 1 ? 'MONO' : `CH ${ch + 1}`, 5, yOffset - channelHeight / 2 + 15);
        }
    }

    /**
     * FIXED: Converts absolute sample position to screen X coordinate
     * Returns pixel position relative to current scroll/zoom viewport
     */
    sampleToX(sample) {
        if (!this.waveformData || this.width <= 0) return 0;
        
        const { length } = this.waveformData;
        const { zoom, scrollSample, width } = this;
        
        // Calculate visible range
        const visibleSamples = Math.max(1, Math.floor(length / zoom));
        
        // Calculate offset from scroll position
        const offsetFromScroll = sample - scrollSample;
        
        // Convert to pixel position
        const pixelPos = (offsetFromScroll / visibleSamples) * width;
        
        return pixelPos;
    }

    /**
     * FIXED: Converts screen X coordinate to absolute sample position
     * Returns integer sample index in full audio buffer
     */
    xToSample(x) {
        if (!this.waveformData || this.width <= 0) return 0;
        
        const { length } = this.waveformData;
        const { zoom, scrollSample, width } = this;
        
        // Calculate visible range
        const visibleSamples = Math.max(1, Math.floor(length / zoom));
        
        // Convert pixel to sample offset
        const ratio = x / width;
        const sampleOffset = Math.floor(ratio * visibleSamples);
        
        // Add to scroll position for absolute sample
        const absoluteSample = scrollSample + sampleOffset;
        
        // Clamp to valid range
        return Math.max(0, Math.min(length - 1, absoluteSample));
    }
}

// ============================================
// AUDIO ENGINE
// ============================================
class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.audioBuffer = null;
        this.source = null;
        this.isPlaying = false;
        this.startTime = 0;
        this.playbackStartSample = 0;
        this.playbackEndSample = 0;
        this.loopStartSample = 0;
        this.loopEndSample = 0;
        this.loopEnabled = false;
        this.isReversed = false;
        this.reversedBuffer = null;
        this.playbackSessionId = 0;
    }

    async init() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    async loadAudio(arrayBuffer) {
        await this.init();
        this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
        this.reversedBuffer = null; // Clear any cached reversed buffer
        return this.audioBuffer;
    }

    /**
     * Creates a reversed copy of the audio buffer
     */
    createReversedBuffer(buffer) {
        const reversedBuffer = this.audioContext.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );

        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const inputData = buffer.getChannelData(channel);
            const outputData = reversedBuffer.getChannelData(channel);
            
            for (let i = 0; i < buffer.length; i++) {
                outputData[i] = inputData[buffer.length - 1 - i];
            }
        }

        return reversedBuffer;
    }

    play(params = {}) {
        if (!this.audioBuffer) return;
        
        this.stop();
        const sessionId = ++this.playbackSessionId;

        const {
            startSample = 0,
            endSample = this.audioBuffer.length,
            loopStartSample = 0,
            loopEndSample = this.audioBuffer.length,
            loopEnabled = false,
            reverse = false
        } = params;

        // Validate parameters
        if (startSample >= endSample) {
            console.error('Invalid playback range: start >= end');
            return;
        }

        const sampleRate = this.audioBuffer.sampleRate;

        // Store playback state
        this.playbackStartSample = startSample;
        this.playbackEndSample = endSample;
        this.loopStartSample = loopStartSample;
        this.loopEndSample = loopEndSample;
        this.loopEnabled = loopEnabled;
        this.isReversed = reverse;

        // Handle reverse playback
        let bufferToPlay = this.audioBuffer;
        let adjustedStart = startSample;
        let adjustedEnd = endSample;
        let adjustedLoopStart = loopStartSample;
        let adjustedLoopEnd = loopEndSample;

        if (reverse) {
            // Create reversed buffer if not cached
            if (!this.reversedBuffer) {
                this.reversedBuffer = this.createReversedBuffer(this.audioBuffer);
            }
            bufferToPlay = this.reversedBuffer;
            
            // Flip the sample positions for reversed buffer
            const bufferLength = this.audioBuffer.length;
            adjustedStart = bufferLength - endSample;
            adjustedEnd = bufferLength - startSample;
            adjustedLoopStart = bufferLength - loopEndSample;
            adjustedLoopEnd = bufferLength - loopStartSample;
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = bufferToPlay;
        source.connect(this.audioContext.destination);
        this.source = source;

        const startTime = adjustedStart / sampleRate;
        const duration = (adjustedEnd - adjustedStart) / sampleRate;

        if (loopEnabled) {
            source.loop = true;
            source.loopStart = adjustedLoopStart / sampleRate;
            source.loopEnd = adjustedLoopEnd / sampleRate;
        }

        source.start(0, startTime, loopEnabled ? undefined : duration);

        this.isPlaying = true;
        this.startTime = this.audioContext.currentTime;

        source.onended = () => {
            if (this.source === source && this.playbackSessionId === sessionId) {
                this.isPlaying = false;
                this.source = null;
            }
        };
    }

    stop() {
        const sourceToStop = this.source;
        this.source = null;
        if (sourceToStop) {
            try {
                sourceToStop.stop();
            } catch (e) {
                // Already stopped
            }
        }
        this.isPlaying = false;
    }

    /**
     * FIXED: Returns current playback position with loop handling
     */
    getCurrentSample() {
        if (!this.isPlaying || !this.audioBuffer) return 0;
        
        const elapsed = this.audioContext.currentTime - this.startTime;
        const elapsedSamples = elapsed * this.audioBuffer.sampleRate;
        
        if (this.loopEnabled) {
            // Calculate position within loop
            const loopLength = this.loopEndSample - this.loopStartSample;
            const preLoopLength = this.loopStartSample - this.playbackStartSample;
            
            if (elapsedSamples < preLoopLength) {
                // Before loop starts
                return this.playbackStartSample + elapsedSamples;
            } else {
                // Inside loop - wrap around
                const loopElapsed = elapsedSamples - preLoopLength;
                const loopPosition = loopElapsed % loopLength;
                return this.loopStartSample + loopPosition;
            }
        } else {
            // Non-looping - simple linear playback
            const currentSample = this.playbackStartSample + elapsedSamples;
            return Math.min(currentSample, this.playbackEndSample);
        }
    }
}

// ============================================
// MARKER CONTROLLER
// ============================================
class MarkerController {
    constructor(renderer, audioEngine) {
        this.renderer = renderer;
        this.audioEngine = audioEngine;
        this.markers = {
            start: { sample: 0, color: '#ff6b6b', label: ' START', snapZeroCross: true, hidden: false },
            end: { sample: 0, color: '#ff6b6b', label: ' END', snapZeroCross: true, hidden: false },
            loopStart: { sample: 0, color: '#7fb6ff', label: ' LOOP START', snapZeroCross: true, hidden: false },
            loopEnd: { sample: 0, color: '#7fb6ff', label: ' LOOP END', snapZeroCross: true, hidden: false }
        };
        this.dragging = null;
        this.sliceMarkers = []; // For slicer mode
        this.isUpdatingFromDrag = false;
        this.snapToZeroCrossingEnabled = true;  // Default ON
        this.customLoopColor = null;
    }

    applyThemeColors(options = {}) {
        const themeColors = this.renderer.getThemeColors();
        if (Object.prototype.hasOwnProperty.call(options, 'loopColor')) {
            this.customLoopColor = options.loopColor;
        }
        const {
            hideSampleMarkers = this.markers.start.hidden,
            loopColor = this.customLoopColor || themeColors.markerLoop
        } = options;

        this.markers.start.color = themeColors.markerSample;
        this.markers.start.label = ' START';
        this.markers.start.hidden = hideSampleMarkers;

        this.markers.end.color = themeColors.markerSample;
        this.markers.end.label = ' END';
        this.markers.end.hidden = hideSampleMarkers;

        this.markers.loopStart.color = loopColor;
        this.markers.loopStart.label = ' LOOP START';
        this.markers.loopStart.hidden = false;

        this.markers.loopEnd.color = loopColor;
        this.markers.loopEnd.label = ' LOOP END';
        this.markers.loopEnd.hidden = false;
    }

    setMarker(name, sample) {
        if (!this.markers[name]) return;
        if (!this.renderer.waveformData) return;
        
        // Guard against NaN
        if (isNaN(sample) || sample === null || sample === undefined) {
            console.error(`Invalid sample value for marker ${name}: ${sample}`);
            return;
        }
        
        // Clamp to valid range
        const validSample = Math.max(0, Math.min(this.renderer.waveformData.length, sample));
        this.markers[name].sample = validSample;
    }

    addSliceAtSample(sample) {
        // CRITICAL: Max 512 slices (Bitbox hardware limit)
        if (this.sliceMarkers.length >= 512) {
            console.warn('Maximum 512 slices reached');
            window.BitboxerUtils.setStatus('Maximum 512 slices reached', 'error');
            return false;
        }

        const channelData = this.renderer.waveformData.channelData[0];
        
        // Conditionally snap based on toggle state
        const finalSample = this.snapToZeroCrossingEnabled
            ? this.findZeroCrossing(sample, channelData)
            : sample;
        
        // Don't add if too close to existing
             // const minDistance = 100;
             // const tooClose = this.sliceMarkers.some(s => Math.abs(s - finalSample) < minDistance);
             // if (tooClose) {
             //     console.log('Slice too close to existing marker');
             //     return false;
             // }

        this.sliceMarkers.push(finalSample);
        this.sliceMarkers.sort((a, b) => a - b);
        this.updateSlicesToPad();

        const snapStatus = this.snapToZeroCrossingEnabled ? 'snapped' : 'exact';
        console.log(`Added slice at sample ${finalSample} (${snapStatus})`);
        return true;
    }

    findZeroCrossing(targetSample, channelData) {
        const searchRadius = 50;
        const start = Math.max(0, targetSample - searchRadius);
        const end = Math.min(channelData.length - 1, targetSample + searchRadius);

        let bestSample = targetSample;
        let minCrossing = Math.abs(channelData[targetSample]);

        for (let i = start; i < end - 1; i++) {
            const curr = channelData[i];
            const next = channelData[i + 1];
            
            // Check for zero crossing (sign change)
            if ((curr <= 0 && next >= 0) || (curr >= 0 && next <= 0)) {
                const crossing = Math.abs(curr);
                if (crossing < minCrossing) {
                    minCrossing = crossing;
                    bestSample = i;
                }
            }
        }

        return bestSample;
    }

    snapToZeroCrossing(sample, marker) {
        if (!marker.snapZeroCross || !this.renderer.waveformData) return sample;
        
        const channelData = this.renderer.waveformData.channelData[0];
        return this.findZeroCrossing(sample, channelData);
    }

    // Temporary Debug Code
    draw() {
        const { ctx, width, height } = this.renderer;
        const themeColors = this.renderer.getThemeColors();
        
        // Don't draw if canvas width is invalid
        if (!width || width <= 0) {
            return;
        }

        // Get current cell mode to determine marker visibility
        const { currentEditingPad, presetData } = window.BitboxerData;
        let cellmode = '0';
        if (currentEditingPad) {
            const row = parseInt(currentEditingPad.dataset.row);
            const col = parseInt(currentEditingPad.dataset.col);
            cellmode = presetData.pads[row][col]?.params?.cellmode || '0';
        }
        
        // Decide which markers to show based on mode
        const showStandardMarkers = (cellmode === '0' || cellmode === '3'); // Sample or Granular
        const showSliceMarkers = (cellmode === '2'); // Slicer

        // Draw standard markers (start, end, loopStart, loopEnd) only in appropriate modes
        if (showStandardMarkers) {
            this.applyThemeColors();
            Object.entries(this.markers).forEach(([name, marker]) => {
                if (marker.hidden) return;
                const x = this.renderer.sampleToX(marker.sample);
            
                if (x < 0 || x > width) return;

                // Determine if this is a loop marker
                const isLoopMarker = (name === 'loopStart' || name === 'loopEnd');

                // Draw vertical line
                ctx.strokeStyle = marker.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            
                // Position label and handle based on marker type
                const labelY = isLoopMarker ? height - 17 : 5;
                const handleY = isLoopMarker ? height - 20 : 0;

                // Draw label background for readability
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillRect(x + 3, labelY, 80, 12);

                // Draw label
                ctx.fillStyle = marker.color;
                ctx.font = '10px monospace';
                ctx.fillText(marker.label, x + 5, labelY + 10);

                // Draw draggable handle
                ctx.fillStyle = marker.color;
                ctx.fillRect(x - 5, handleY, 10, 20);
            });
        }

        // Draw slice markers only in slicer mode
        if (showSliceMarkers) {
            this.sliceMarkers.forEach(sample => {
                const x = this.renderer.sampleToX(sample);
                if (x < 0 || x > width) return;
            
                ctx.strokeStyle = themeColors.markerSlice;
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
                ctx.setLineDash([]);

                // Draw handle for slice markers too
                ctx.fillStyle = themeColors.markerSlice;
                ctx.fillRect(x - 3, 0, 6, 15);
            });
        }
    }


    drawGranularOverlay(padParams) {
        const { ctx, width, height } = this.renderer;
        const themeColors = this.renderer.getThemeColors();
        if (!this.renderer.waveformData) return;

        const totalLength = this.renderer.waveformData.length;
        const sampleRate = this.renderer.waveformData.sampleRate;

        // Get grain parameters
        const samstart = parseInt(padParams.samstart) || 0;
        const samlen = parseInt(padParams.samlen) || totalLength;
        const grainSourceWindow = parseFloat(padParams.gainssrcwin) / 1000; // 0-1
        
        // Calculate grain window within the actual sample bounds
        const sampleEnd = Math.min(samstart + samlen, totalLength);
        const effectiveLength = sampleEnd - samstart;
        const sourceWindowSamples = Math.floor(effectiveLength * grainSourceWindow);
        const windowStart = samstart + Math.floor((effectiveLength - sourceWindowSamples) / 2);
        const windowEnd = windowStart + sourceWindowSamples;

        // Convert to screen coordinates
        const x1 = this.renderer.sampleToX(windowStart);
        const x2 = this.renderer.sampleToX(windowEnd);

        // Draw semi-transparent overlay outside grain window
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        if (x1 > 0) {
            ctx.fillRect(0, 0, x1, height);
        }
        if (x2 < width) {
            ctx.fillRect(x2, 0, width - x2, height);
        }

        // Draw grain window border
        ctx.strokeStyle = themeColors.overlayAccent;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.strokeRect(x1, 0, x2 - x1, height);
        ctx.setLineDash([]);

        // Draw grain window label
        ctx.fillStyle = themeColors.overlayAccent;
        ctx.font = '12px monospace';
        const grainPercent = (grainSourceWindow * 100).toFixed(0);
        ctx.fillText(`GRAIN WINDOW (${grainPercent}%)`, Math.max(5, x1 + 5), height - 10);

        // NO ANIMATION - Static display only
    }

    drawClipBeatGrid(padParams, tempo) {
        const { ctx, width, height } = this.renderer;
        const themeColors = this.renderer.getThemeColors();
        if (!this.renderer.waveformData) return;

        const totalLength = this.renderer.waveformData.length;
        const sampleRate = this.renderer.waveformData.sampleRate;
        const bpm = parseFloat(tempo) || 120;

        // Get beat count (0 = auto, >0 = specific count)
        let beatCount = parseInt(padParams.beatcount) || 0;
        
        if (beatCount === 0) {
            // Auto-detect: assume sample duration in seconds
            const durationSeconds = totalLength / sampleRate;
            const beatsPerSecond = bpm / 60;
            beatCount = Math.round(durationSeconds * beatsPerSecond);
        }

        if (beatCount <= 0) return;

        // Calculate samples per beat
        const samplesPerBeat = totalLength / beatCount;

        // Draw beat grid lines
        ctx.strokeStyle = themeColors.beatGrid;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);

        for (let i = 0; i <= beatCount; i++) {
            const sample = Math.floor(i * samplesPerBeat);
            const x = this.renderer.sampleToX(sample);

            if (x < 0 || x > width) continue;

            // Draw beat line
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            // Draw beat number
            if (i % 4 === 0 || beatCount <= 16) {
                ctx.fillStyle = themeColors.markerLoop;
                ctx.font = '10px monospace';
                ctx.fillText(`${i + 1}`, x + 3, height - 25);
            }
        }

        ctx.setLineDash([]);

        // Draw synctype subdivision lines (lighter)
        const synctype = parseInt(padParams.synctype) || 6;
        const subdivisions = this.getSynctypeSubdivisions(synctype);

        if (subdivisions > 1) {
            ctx.strokeStyle = themeColors.beatGridSubtle;
            ctx.lineWidth = 1;

            for (let beat = 0; beat < beatCount; beat++) {
                for (let sub = 1; sub < subdivisions; sub++) {
                    const sample = Math.floor((beat + sub / subdivisions) * samplesPerBeat);
                    const x = this.renderer.sampleToX(sample);

                    if (x < 0 || x > width) continue;

                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, height);
                    ctx.stroke();
                }
            }
        }

        // Draw beat count label
        ctx.fillStyle = themeColors.markerLoop;
        ctx.font = '12px monospace';
        const label = beatCount === parseInt(padParams.beatcount) 
            ? `${beatCount} BEATS` 
            : `${beatCount} BEATS (AUTO)`;
        ctx.fillText(label, 5, height - 10);

        // Draw BPM indicator
        ctx.fillText(`${bpm} BPM`, width - 80, height - 10);
    }

    getSynctypeSubdivisions(synctype) {
        // synctype values: 0=Slice, 1=1bar, 2=1/2, 3=1/4, 4=1/8, 5=1/16, 6=none
        const subdivisionMap = {
            0: 1,  // Slice - no subdivision
            1: 1,  // 1 bar - no subdivision
            2: 2,  // 1/2 - 2 subdivisions per beat
            3: 4,  // 1/4 - 4 subdivisions per beat
            4: 8,  // 1/8 - 8 subdivisions per beat
            5: 16, // 1/16 - 16 subdivisions per beat
            6: 1   // None - no subdivision
        };
        
        return subdivisionMap[synctype] || 1;
    }

    handleMouseDown(x, y, mode, shiftKey = false) {
        console.log(`handleMouseDown: x=${x}, y=${y}, mode=${mode}, shift=${shiftKey}`);
        
        // Get current cell mode
        const { currentEditingPad, presetData } = window.BitboxerData;
        let cellmode = '0';
        if (currentEditingPad) {
            const row = parseInt(currentEditingPad.dataset.row);
            const col = parseInt(currentEditingPad.dataset.col);
            cellmode = presetData.pads[row][col]?.params?.cellmode || '0';
        }

        console.log(`Cellmode: ${cellmode}`);

        // Shift+Click in slicer mode = add slice marker
        if (shiftKey && cellmode === '2') {
            console.log('Shift+Click detected, adding slice');
            const result = this.addSliceAtPosition(x);
            console.log(`addSliceAtPosition returned: ${result}`);
            return true;
        }

        // Check standard markers (STRICT: must be within handle rectangle)
        if (cellmode === '0' || cellmode === '3') {
            const threshold = 5; // Must be within handle width (10px total, ±5px)
            console.log('Checking standard markers');

            for (const [name, marker] of Object.entries(this.markers)) {
                const markerX = this.renderer.sampleToX(marker.sample);
                const isLoopMarker = (name === 'loopStart' || name === 'loopEnd');

                // Strict Y-coordinate check: must be INSIDE handle rectangle
                const handleTop = isLoopMarker ? (this.renderer.height - 20) : 0;
                const handleBottom = isLoopMarker ? this.renderer.height : 20;
                const inHandleY = (y >= handleTop && y <= handleBottom);

                console.log(`  Marker ${name}: x=${markerX}, distance=${Math.abs(x - markerX)}, y=${y}, handleTop=${handleTop}, handleBottom=${handleBottom}, inHandleY=${inHandleY}`);

                // Must be within BOTH X threshold AND Y handle zone
                if (Math.abs(x - markerX) < threshold && inHandleY) {
                    this.dragging = { type: 'marker', name };
                    console.log(`✓ Started dragging ${name} marker`);
                    return true;
                }
            }
        }

        // In slicer mode, check for dragging slice markers (STRICT: top 15px only)
        if (cellmode === '2') {
            const threshold = 3; // Slice handles are smaller (6px wide)
            console.log(`Checking slice markers (${this.sliceMarkers.length} slices)`);

            // STRICT: Must be in top 15px (handle zone)
            if (y <= 15) {
                for (let i = 0; i < this.sliceMarkers.length; i++) {
                    const markerX = this.renderer.sampleToX(this.sliceMarkers[i]);
                    console.log(`  Slice ${i}: x=${markerX}, distance=${Math.abs(x - markerX)}`);

                    if (Math.abs(x - markerX) < threshold) {
                        this.dragging = { type: 'slice', index: i };
                        console.log(`✓ Started dragging slice marker ${i}`);
                        return true;
                    }
                }
            }
        }

        console.log('✗ No marker grabbed, returning false');
        return false;
    }

    handleRightClick(x, y) {
        // Only for deleting slice markers in slicer mode
        const { currentEditingPad, presetData } = window.BitboxerData;
        let cellmode = '0';
        if (currentEditingPad) {
            const row = parseInt(currentEditingPad.dataset.row);
            const col = parseInt(currentEditingPad.dataset.col);
            cellmode = presetData.pads[row][col]?.params?.cellmode || '0';
        }

        // Only allow deletion in slicer mode
        if (cellmode !== '2') {
            console.log('Right-click ignored - not in slicer mode');
            return false;
        }

        const threshold = 10;

        for (let i = 0; i < this.sliceMarkers.length; i++) {
            const markerX = this.renderer.sampleToX(this.sliceMarkers[i]);
            if (Math.abs(x - markerX) < threshold) {
                console.log(`Right-click: Deleting slice marker ${i}`);
                this.removeSliceAtIndex(i);
                return true;
            }
        }

        console.log('Right-click: No slice marker found at position');
        return false;
    }

    handleMouseMove(x) {
        if (!this.dragging) return false;

        let sample = this.renderer.xToSample(x);

        if (this.dragging.type === 'marker') {
            const marker = this.markers[this.dragging.name];

            // Apply snap only if enabled
            if (this.snapToZeroCrossingEnabled && marker.snapZeroCross) {
                sample = this.snapToZeroCrossing(sample, marker);
            }

            this.setMarker(this.dragging.name, sample);
            this.updatePadParams();
        } else if (this.dragging.type === 'slice') {
            const channelData = this.renderer.waveformData.channelData[0];

            // Apply snap only if enabled
            if (this.snapToZeroCrossingEnabled) {
                sample = this.findZeroCrossing(sample, channelData);
            }

            this.sliceMarkers[this.dragging.index] = sample;
            this.updateSlicesToPad();
        }

        return true;
    }

    handleMouseUp() {
        if (this.dragging) {
            this.dragging = null;
            return true;
        }
        return false;
    }

    updatePadParams() {
        const { currentEditingPad, presetData } = window.BitboxerData;
        if (!currentEditingPad) return;

        const row = parseInt(currentEditingPad.dataset.row);
        const col = parseInt(currentEditingPad.dataset.col);
        const pad = presetData.pads[row][col];

        // Set flag to prevent circular updates - MUST be set BEFORE any slider updates
        this.isUpdatingFromDrag = true;

        // Validate marker samples before using them
        const startSample = this.markers.start.sample;
        const endSample = this.markers.end.sample;
        const loopStartSample = this.markers.loopStart.sample;
        const loopEndSample = this.markers.loopEnd.sample;
        
        // Guard against NaN/invalid values
        if (isNaN(startSample) || isNaN(endSample) || isNaN(loopStartSample) || isNaN(loopEndSample)) {
            console.error('Invalid marker samples detected, skipping update');
            this.isUpdatingFromDrag = false;
            return;
        }

        // Update pad params
        pad.params.samstart = startSample.toString();
        pad.params.samlen = Math.max(0, endSample - startSample).toString();
        pad.params.loopstart = loopStartSample.toString();
        pad.params.loopend = loopEndSample.toString();

        // Update sliders (this will trigger input events, but flag prevents sync)
        ['samstart', 'samlen', 'loopstart', 'loopend'].forEach(param => {
            const slider = document.getElementById(param);
            if (slider) {
                slider.value = pad.params[param];
                window.BitboxerUtils.updateParamDisplay(param, pad.params[param]);
            }
        });

        // Clear flag immediately after slider updates (synchronous)
        this.isUpdatingFromDrag = false;
    }

    updateSlicesToPad() {
        const { currentEditingPad, presetData } = window.BitboxerData;
        if (!currentEditingPad) return;

        const row = parseInt(currentEditingPad.dataset.row);
        const col = parseInt(currentEditingPad.dataset.col);
        const pad = presetData.pads[row][col];

        // Sort slices by position
        this.sliceMarkers.sort((a, b) => a - b);

        // Update pad slices array
        pad.slices = this.sliceMarkers.map(sample => ({ pos: sample.toString() }));
    }

    syncFromPadParams(pad) {
        // Parse and validate all values
        const samstart = parseInt(pad.params.samstart);
        const samlen = parseInt(pad.params.samlen);
        const loopstart = parseInt(pad.params.loopstart);
        const loopend = parseInt(pad.params.loopend);
        
        // Guard against NaN - use 0 as fallback
        const validStart = isNaN(samstart) ? 0 : samstart;
        const validLen = isNaN(samlen) ? 0 : samlen;
        const validLoopStart = isNaN(loopstart) ? 0 : loopstart;
        const validLoopEnd = isNaN(loopend) ? validLen : loopend;
        
        console.log(`syncFromPadParams: start=${validStart}, len=${validLen}, loopStart=${validLoopStart}, loopEnd=${validLoopEnd}`);
        
        this.setMarker('start', validStart);
        this.setMarker('end', validStart + validLen);
        this.setMarker('loopStart', validLoopStart);
        this.setMarker('loopEnd', validLoopEnd);
        
        // Load slices if in slicer mode
        if (pad.params.cellmode === '2') {
            if (pad.slices && pad.slices.length > 0) {
                this.sliceMarkers = pad.slices.map(slice => {
                    const pos = parseInt(slice.pos);
                    return isNaN(pos) ? 0 : pos;
                }).filter(pos => pos >= 0); // Keep sample 0
            } else {
                // Always start with marker at sample 0 in slicer mode
                this.sliceMarkers = [0];
            }

            // Ensure marker at sample 0 exists
            if (!this.sliceMarkers.includes(0)) {
                this.sliceMarkers.unshift(0);
            }

            // Sort and remove duplicates
            this.sliceMarkers = [...new Set(this.sliceMarkers)].sort((a, b) => a - b);
        } else {
            this.sliceMarkers = [];
        }
    }

    addSliceAtPosition(x) {
        const sample = this.renderer.xToSample(x);
        const channelData = this.renderer.waveformData.channelData[0];
        
        // Conditionally snap based on toggle state
        const finalSample = this.snapToZeroCrossingEnabled 
            ? this.findZeroCrossing(sample, channelData)
            : sample;
        
        // Don't add if too close to existing slice
        const minDistance = 1000; // samples
        const tooClose = this.sliceMarkers.some(s => Math.abs(s - finalSample) < minDistance);
        if (tooClose) {
            console.log('Slice too close to existing marker, ignoring');
            return false;
        }

        this.sliceMarkers.push(finalSample);
        this.sliceMarkers.sort((a, b) => a - b);
        this.updateSlicesToPad();

        const snapStatus = this.snapToZeroCrossingEnabled ? 'snapped' : 'exact';
        console.log(`Added slice marker at sample ${finalSample} (${snapStatus})`);
        return true;
    }

    removeSliceAtIndex(index) {
        this.sliceMarkers.splice(index, 1);
        this.updateSlicesToPad();
    }

    /**
     * Auto-detect slice points using advanced onset detection
     * @param {string} algorithm - 'hfc', 'flux', or 'complex'
     * @param {number} sensitivity - 0.0 to 1.0
     */
    autoDetectSlices(algorithm = 'flux', sensitivity = 0.5, minSliceDistance = 1000) {
        if (!this.renderer.waveformData) return;
        
        console.log(`Auto-detecting slices: ${algorithm}, sensitivity: ${sensitivity}, minDistance: ${minSliceDistance}`);
        
        const detector = new OnsetDetector(this.renderer.waveformData, {
            algorithm: algorithm,
            sensitivity: sensitivity,
            windowSize: 1024,
            hopSize: 512,
            minSliceDistance: minSliceDistance
        });
        
        const onsetSamples = detector.analyze();
        
        // CRITICAL FIX: Enforce 512 slice limit BEFORE processing
        let limitedOnsets = onsetSamples;
        if (onsetSamples.length > 511) { // 511 because we add sample 0 later
            console.warn(`Detected ${onsetSamples.length} slices, truncating to 511`);
            limitedOnsets = onsetSamples.slice(0, 511);
            window.BitboxerUtils.setStatus(
                `Detected ${onsetSamples.length} slices, limited to 512 (hardware maximum)`,
                'info'
            );
        }
        
        // Snap to zero crossings if enabled
        const channelData = this.renderer.waveformData.channelData[0];
        this.sliceMarkers = limitedOnsets.map(sample => 
            this.snapToZeroCrossingEnabled 
                ? this.findZeroCrossing(sample, channelData)
                : sample
        );
    
        // Ensure marker at sample 0 exists
        if (!this.sliceMarkers.includes(0)) {
            this.sliceMarkers.unshift(0);
        }
    
        // FINAL SAFETY CHECK: Hard cap at 512
        if (this.sliceMarkers.length > 512) {
            console.error(`Slice count exceeded 512 after processing, truncating`);
            this.sliceMarkers = this.sliceMarkers.slice(0, 512);
        }
    
        // Remove duplicates and sort
        this.sliceMarkers = [...new Set(this.sliceMarkers)].sort((a, b) => a - b);
    
        this.updateSlicesToPad();
    
        const snapStatus = this.snapToZeroCrossingEnabled ? 'with zero-crossing snap' : 'exact positions';
        console.log(`Detected ${this.sliceMarkers.length} slices using ${algorithm} (${snapStatus})`);
    }
}

// ============================================
// ZOOM CONTROLLER
// ============================================
class ZoomController {
    constructor(renderer) {
        this.renderer = renderer;
        this.minZoom = 1;
        this.maxZoom = 10000;
        this.lastWheelTimestamp = 0;
    }

    syncZoomUI() {
        window.BitboxerSampleEditor?.scrollZoomBar?.update();
        const zoomValue = document.getElementById('zoomValue');
        if (zoomValue) {
            zoomValue.textContent = this.renderer.zoom.toFixed(1) + 'x zoom';
        }
    }

    setZoom(zoom) {
        this.renderer.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
        
        // FIX: Clamp scroll position when zoom changes
        const maxScroll = Math.max(0, 1 - (1 / this.renderer.zoom));
        this.renderer.scrollPos = Math.min(this.renderer.scrollPos, maxScroll);
        
        this.renderer.render();
    }

    setScroll(scrollPos) {
        this.renderer.scrollPos = Math.max(0, Math.min(1 - 1 / this.renderer.zoom, scrollPos));
        this.renderer.render();
    }

    handleWheel(deltaY, mouseX, options = {}) {
        if (!this.renderer.waveformData) return;
        
        const oldZoom = this.renderer.zoom;
        const oldScrollSample = this.renderer.scrollSample;
        const width = this.renderer.width;
        const totalSamples = this.renderer.waveformData.length;
        const {
            deltaMode = 0,
            shiftKey = false,
            timestamp = performance.now()
        } = options;
        const baseZoom = oldZoom;
        const baseScrollSample = oldScrollSample;

        // Normalize wheel delta so zoom responds consistently across pixel-, line-,
        // and page-based wheel events, then add a speed-based boost from the time
        // between wheel impulses with a strongly non-linear progression.
        const normalizedDelta = deltaMode === 1
            ? deltaY * 72
            : deltaMode === 2
                ? deltaY * 320
                : deltaY;
        const magnitude = Math.min(960, Math.abs(normalizedDelta));
        const deltaSign = Math.sign(normalizedDelta);
        if (deltaSign === 0 || magnitude === 0) {
            return;
        }

        const modeBoost = deltaMode === 1 ? 2.8 : deltaMode === 2 ? 3.4 : 1;
        const magnitudeBoost = Math.pow(
            1 + (magnitude / (deltaMode === 1 ? 110 : 140)),
            deltaMode === 1 ? 1.6 : 1.35
        ) * modeBoost;
        const elapsed = this.lastWheelTimestamp > 0
            ? Math.max(8, timestamp - this.lastWheelTimestamp)
            : 48;
        this.lastWheelTimestamp = timestamp;

        const speedBoost = 1 + Math.min(
            deltaMode === 1 ? 12 : 8,
            Math.pow((deltaMode === 1 ? 108 : 72) / elapsed, deltaMode === 1 ? 1.7 : 1.45)
        );
        const shiftMultiplier = shiftKey ? 2.2 : 1;
        const effectiveDelta = deltaSign * magnitudeBoost * speedBoost * shiftMultiplier;
        const zoomFactor = Math.exp(-effectiveDelta * (deltaMode === 1 ? 0.0056 : 0.0048));
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, baseZoom * zoomFactor));

        if (Math.abs(newZoom - baseZoom) < 0.0001) {
            return;
        }
        
        // Find which sample is currently at mouseX position (INTEGER)
        const oldVisibleSamples = Math.floor(totalSamples / baseZoom);
        const sampleAtMouse = baseScrollSample + Math.floor((mouseX / width) * oldVisibleSamples);
        
        // Calculate new scroll position to keep that sample at mouseX (INTEGER)
        const newVisibleSamples = Math.floor(totalSamples / newZoom);
        const newScrollSample = sampleAtMouse - Math.floor((mouseX / width) * newVisibleSamples);
        
        // Clamp to valid range (INTEGER)
        const maxScrollSample = Math.max(0, totalSamples - newVisibleSamples);
        this.renderer.zoom = newZoom;
        this.renderer.scrollSample = Math.max(0, Math.min(maxScrollSample, newScrollSample));
        this.renderer.render();
        this.syncZoomUI();
    }
}

// ============================================
// UNIFIED SCROLL-ZOOM BAR
// ============================================
class ScrollZoomBar {
    constructor(renderer, onUpdate) {
        this.renderer = renderer;
        this.onUpdate = onUpdate; // Callback when zoom/scroll changes
        this.canvas = null;
        this.ctx = null;
        this.width = 0;
        this.height = 30;
        
        // Zoom/scroll state
        this.minZoom = 1;
        this.maxZoom = 10000;
        
        // Interaction state
        this.dragging = null; // null | 'body' | 'left-edge' | 'right-edge'
        this.dragStartX = 0;
        this.dragStartZoom = 1;
        this.dragStartScroll = 0;
        
        // Visual styling
        this.colors = this.getThemeColors();
    }

    getThemeColors() {
        const rootStyles = getComputedStyle(document.documentElement);
        return {
            track: rootStyles.getPropertyValue('--scrollbar-track').trim() || '#241d1a',
            thumb: rootStyles.getPropertyValue('--scrollbar-thumb').trim() || '#8d4d26',
            thumbHover: rootStyles.getPropertyValue('--scrollbar-thumb-hover').trim() || '#b36432',
            border: rootStyles.getPropertyValue('--color-border').trim() || '#4a4038',
            handle: rootStyles.getPropertyValue('--color-text-primary').trim() || '#ffffff'
        };
    }
    
    init(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error('ScrollZoomBar: Canvas not found:', canvasId);
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        this.setupEventListeners();
        this.render();
    }
    
    resize() {
        const container = this.canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        
        this.width = container.offsetWidth;
        
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
        
        this.ctx.scale(dpr, dpr);
        
        this.render();
    }
    
    /**
     * Calculates thumb position and width based on current zoom/scroll
     */
    getThumbGeometry() {
        if (!this.renderer.waveformData) {
            return { x: 0, width: this.width };
        }
        
        const totalSamples = this.renderer.waveformData.length;
        const visibleSamples = Math.floor(totalSamples / this.renderer.zoom);
        const maxScroll = Math.max(0, totalSamples - visibleSamples);
        
        // Thumb width represents visible portion
        const thumbWidth = Math.max(20, (visibleSamples / totalSamples) * this.width);
        
        // Thumb position represents scroll position
        const scrollRatio = maxScroll > 0 ? (this.renderer.scrollSample / maxScroll) : 0;
        const thumbX = scrollRatio * (this.width - thumbWidth);
        
        return {
            x: thumbX,
            width: thumbWidth,
            scrollRatio: scrollRatio,
            visibleRatio: visibleSamples / totalSamples
        };
    }
    
    render() {
        if (!this.ctx || this.width <= 0) return;
        
        const { ctx, width, height } = this;
        this.colors = this.getThemeColors();
        
        // Clear
        ctx.fillStyle = this.colors.track;
        ctx.fillRect(0, 0, width, height);
        
        // Draw outer border
        ctx.strokeStyle = this.colors.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
        
        // Get thumb geometry
        const thumb = this.getThumbGeometry();
        
        // Draw thumb
        const isHovering = this.dragging !== null;
        ctx.fillStyle = isHovering ? this.colors.thumbHover : this.colors.thumb;
        ctx.fillRect(thumb.x, 4, thumb.width, height - 8);
        
        // Draw thumb border
        ctx.strokeStyle = this.colors.border;
        ctx.strokeRect(thumb.x + 0.5, 4.5, thumb.width - 1, height - 9);
        
        // Draw edge handles (visual indicators)
        ctx.fillStyle = this.colors.handle;
        const handleWidth = 2;
        const handleHeight = 12;
        const handleY = (height - handleHeight) / 2;
        
        // Left handle
        ctx.fillRect(thumb.x + 4, handleY, handleWidth, handleHeight);
        
        // Right handle
        ctx.fillRect(thumb.x + thumb.width - 4 - handleWidth, handleY, handleWidth, handleHeight);
        
        // Draw center grip (3 vertical lines)
        const centerX = thumb.x + thumb.width / 2;
        for (let i = -1; i <= 1; i++) {
            ctx.fillRect(centerX + i * 4 - 1, handleY, handleWidth, handleHeight);
        }
    }
    
    setupEventListeners() {
        const canvas = this.canvas;
        
        canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        canvas.addEventListener('mouseup', () => this.handleMouseUp());
        canvas.addEventListener('mouseleave', () => this.handleMouseUp());
        
        // Cursor feedback
        canvas.addEventListener('mousemove', (e) => {
            if (this.dragging) return;
            
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const thumb = this.getThumbGeometry();
            
            const edgeThreshold = 8;
            const onLeftEdge = (x >= thumb.x && x <= thumb.x + edgeThreshold);
            const onRightEdge = (x >= thumb.x + thumb.width - edgeThreshold && x <= thumb.x + thumb.width);
            const onBody = (x > thumb.x + edgeThreshold && x < thumb.x + thumb.width - edgeThreshold);
            
            if (onLeftEdge || onRightEdge) {
                canvas.style.cursor = 'ew-resize';
            } else if (onBody) {
                canvas.style.cursor = 'grab';
            } else {
                canvas.style.cursor = 'default';
            }
        });
    }
    
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const thumb = this.getThumbGeometry();
        
        const edgeThreshold = 8;
        const onLeftEdge = (x >= thumb.x && x <= thumb.x + edgeThreshold);
        const onRightEdge = (x >= thumb.x + thumb.width - edgeThreshold && x <= thumb.x + thumb.width);
        const onBody = (x > thumb.x + edgeThreshold && x < thumb.x + thumb.width - edgeThreshold);
        
        if (onLeftEdge) {
            this.dragging = 'left-edge';
            this.dragStartX = x;
            this.dragStartZoom = this.renderer.zoom;
            this.dragStartScroll = this.renderer.scrollSample;
            this.canvas.style.cursor = 'ew-resize';
        } else if (onRightEdge) {
            this.dragging = 'right-edge';
            this.dragStartX = x;
            this.dragStartZoom = this.renderer.zoom;
            this.dragStartScroll = this.renderer.scrollSample;
            this.canvas.style.cursor = 'ew-resize';
        } else if (onBody) {
            this.dragging = 'body';
            this.dragStartX = x;
            this.dragStartScroll = this.renderer.scrollSample;
            this.canvas.style.cursor = 'grabbing';
        }
        
        this.render();
    }
    
    handleMouseMove(e) {
        if (!this.dragging || !this.renderer.waveformData) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const deltaX = x - this.dragStartX;
        
        const totalSamples = this.renderer.waveformData.length;
        
        if (this.dragging === 'body') {
            // Pan viewport
            const visibleSamples = Math.floor(totalSamples / this.renderer.zoom);
            const maxScroll = Math.max(0, totalSamples - visibleSamples);
            const thumbRange = this.width - (visibleSamples / totalSamples) * this.width;
            
            if (thumbRange > 0) {
                const scrollDelta = (deltaX / thumbRange) * maxScroll;
                const newScroll = Math.max(0, Math.min(maxScroll, this.dragStartScroll + scrollDelta));
                this.renderer.scrollSample = Math.floor(newScroll);
            }
        } else if (this.dragging === 'left-edge') {
            // Zoom by dragging left edge (zoom in = drag right, zoom out = drag left)
            const zoomSensitivity = 0.02;
            const zoomFactor = Math.exp(deltaX * zoomSensitivity);
            const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.dragStartZoom * zoomFactor));
            
            // Adjust scroll to keep right edge fixed
            const oldVisibleSamples = Math.floor(totalSamples / this.dragStartZoom);
            const newVisibleSamples = Math.floor(totalSamples / newZoom);
            const rightEdge = this.dragStartScroll + oldVisibleSamples;
            const newScroll = Math.max(0, rightEdge - newVisibleSamples);
            
            this.renderer.zoom = newZoom;
            this.renderer.scrollSample = Math.floor(newScroll);
        } else if (this.dragging === 'right-edge') {
            // Zoom by dragging right edge (zoom in = drag left, zoom out = drag right)
            const zoomSensitivity = 0.02;
            const zoomFactor = Math.exp(-deltaX * zoomSensitivity);
            const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.dragStartZoom * zoomFactor));
            
            // Keep left edge (scroll position) fixed
            this.renderer.zoom = newZoom;
            
            // Clamp scroll
            const visibleSamples = Math.floor(totalSamples / newZoom);
            const maxScroll = Math.max(0, totalSamples - visibleSamples);
            this.renderer.scrollSample = Math.max(0, Math.min(maxScroll, this.dragStartScroll));
        }
        
        this.render();
        if (this.onUpdate) this.onUpdate();
    }
    
    handleMouseUp() {
        if (this.dragging) {
            this.dragging = null;
            this.canvas.style.cursor = 'default';
            this.render();
        }
    }
    
    /**
     * External update (called when zoom/scroll changes from other sources)
     */
    update() {
        this.render();
    }
}

// ============================================
// MAIN SAMPLE EDITOR
// ============================================
class SampleEditor {
    constructor() {
        this.renderer = null;
        this.audioEngine = new AudioEngine();
        this.markerController = null;
        this.zoomController = null;
        this.scrollZoomBar = null;
        this.animationFrame = null;
        this.currentMode = '0';
        // this.granularAnimating = false;

        // Selection state
        this.selectionStart = null;  
        this.selectionEnd = null; 
        this.clipboard = null;
        this.history = [];
        this.maxHistoryEntries = 20;
        this.contextCursorSample = 0;
        this.suppressModalCloseUntil = 0;

        // Prevent duplicate event listeners   
        this._eventListenersAttached = false;  

        // Render throttling
        this._renderScheduled = false;
    }

    suppressModalClose(durationMs = 250) {
        this.suppressModalCloseUntil = Math.max(
            this.suppressModalCloseUntil || 0,
            performance.now() + durationMs
        );
    }

    shouldSuppressModalClose() {
        return performance.now() < (this.suppressModalCloseUntil || 0);
    }

    /**
     * Clears only audio/waveform data when switching pads
     * Does NOT reset markers, zoom, or other UI state
     */
    clearAudioData() {
        console.log('SampleEditor: Clearing audio data for pad switch');

        // Stop any playing audio
        this.stop();

        // Clear audio buffers
        if (this.audioEngine) {
            this.audioEngine.audioBuffer = null;
            this.audioEngine.reversedBuffer = null;
            this.audioEngine.isPlaying = false;
        }

        // Clear waveform data but keep canvas sized
        if (this.renderer && this.renderer.waveformData) {
            this.renderer.waveformData = null;

            // Clear canvas visually
            const ctx = this.renderer.ctx;
            if (ctx && this.renderer.width > 0 && this.renderer.height > 0) {
                ctx.fillStyle = this.renderer.getThemeColors().background;
                ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);
            }
        }

        if (this.markerController) {
            this.markerController.sliceMarkers = [];
            this.markerController.customLoopColor = null;
            this.markerController.applyThemeColors({
                hideSampleMarkers: false
            });
            Object.values(this.markerController.markers).forEach((marker) => {
                marker.sample = 0;
                marker.hidden = false;
            });
        }

        this.selectionStart = null;
        this.selectionEnd = null;

        // Stop animations
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        if (this.playbackAnimationFrame) {
            cancelAnimationFrame(this.playbackAnimationFrame);
            this.playbackAnimationFrame = null;
        }
    }

    async init(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        this.renderer = new WaveformRenderer(canvas);
        this.markerController = new MarkerController(this.renderer, this.audioEngine);
        this.zoomController = new ZoomController(this.renderer);

        if (!canvas.hasAttribute('tabindex')) {
            canvas.tabIndex = 0;
        }

        this.setupEventListeners(canvas);
        this.renderer.resize();
    }

    getSelectionRange({ requireLength = true } = {}) {
        if (this.selectionStart === null || this.selectionEnd === null) {
            return null;
        }

        if (isNaN(this.selectionStart) || isNaN(this.selectionEnd)) {
            return null;
        }

        const start = Math.max(0, Math.min(this.selectionStart, this.selectionEnd));
        const end = Math.max(0, Math.max(this.selectionStart, this.selectionEnd));

        if (requireLength && end <= start) {
            return null;
        }

        return {
            start: Math.floor(start),
            end: Math.floor(end)
        };
    }

    getCurrentFileBinding() {
        const isMultisampleEditor = this === window._multiSampleEditor;
        if (isMultisampleEditor) {
            const asset = window._multiEditorState?.currentAsset || null;
            const fileName = asset?.filename ? asset.filename.split(/[/\\]/).pop() : null;
            return { isMultisampleEditor, asset, pad: null, fileName };
        }

        const { currentEditingPad, presetData } = window.BitboxerData;
        if (!currentEditingPad) {
            return { isMultisampleEditor: false, asset: null, pad: null, fileName: null };
        }

        const row = parseInt(currentEditingPad.dataset.row, 10);
        const col = parseInt(currentEditingPad.dataset.col, 10);
        const pad = presetData?.pads?.[row]?.[col] || null;
        const fileName = pad?.filename ? pad.filename.split(/[/\\]/).pop() : null;
        return { isMultisampleEditor: false, asset: null, pad, fileName };
    }

    createBufferFromChannels(channelData, sampleRate) {
        const channelCount = channelData.length;
        const length = channelData[0]?.length || 0;
        const buffer = this.audioEngine.audioContext.createBuffer(channelCount, length, sampleRate);

        channelData.forEach((data, channel) => {
            buffer.copyToChannel(data, channel);
        });

        return buffer;
    }

    encodeWavBuffer(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const format = 1;
        const bitDepth = 16;
        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataLength = audioBuffer.length * blockAlign;
        const buffer = new ArrayBuffer(44 + dataLength);
        const view = new DataView(buffer);

        const writeString = (offset, text) => {
            for (let i = 0; i < text.length; i++) {
                view.setUint8(offset + i, text.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        writeString(36, 'data');
        view.setUint32(40, dataLength, true);

        const channels = [];
        for (let channel = 0; channel < numChannels; channel++) {
            channels.push(audioBuffer.getChannelData(channel));
        }

        let offset = 44;
        for (let sample = 0; sample < audioBuffer.length; sample++) {
            for (let channel = 0; channel < numChannels; channel++) {
                const value = Math.max(-1, Math.min(1, channels[channel][sample]));
                const pcm = value < 0 ? value * 0x8000 : value * 0x7fff;
                view.setInt16(offset, Math.round(pcm), true);
                offset += 2;
            }
        }

        return buffer;
    }

    buildClipboardFromRange(start, end) {
        const source = this.audioEngine.audioBuffer;
        const channelData = [];

        for (let channel = 0; channel < source.numberOfChannels; channel++) {
            channelData.push(source.getChannelData(channel).slice(start, end));
        }

        return {
            sampleRate: source.sampleRate,
            numberOfChannels: source.numberOfChannels,
            length: Math.max(0, end - start),
            channelData
        };
    }

    captureEditorSnapshot() {
        if (!this.audioEngine.audioBuffer) {
            return null;
        }

        const buffer = this.audioEngine.audioBuffer;
        const channelData = [];
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            channelData.push(buffer.getChannelData(channel).slice());
        }

        return {
            sampleRate: buffer.sampleRate,
            channelData,
            selectionStart: this.selectionStart,
            selectionEnd: this.selectionEnd,
            markers: this.markerController ? {
                start: this.markerController.markers.start.sample,
                end: this.markerController.markers.end.sample,
                loopStart: this.markerController.markers.loopStart.sample,
                loopEnd: this.markerController.markers.loopEnd.sample
            } : null,
            sliceMarkers: this.markerController ? [...this.markerController.sliceMarkers] : []
        };
    }

    pushUndoState() {
        const snapshot = this.captureEditorSnapshot();
        if (!snapshot) {
            return;
        }

        this.history.push(snapshot);
        if (this.history.length > this.maxHistoryEntries) {
            this.history.shift();
        }
    }

    restoreSnapshot(snapshot) {
        if (!snapshot) {
            return false;
        }

        const newBuffer = this.createBufferFromChannels(snapshot.channelData, snapshot.sampleRate);
        this.audioEngine.audioBuffer = newBuffer;
        this.audioEngine.reversedBuffer = null;
        this.renderer.setWaveformData(newBuffer);

        if (this.markerController && snapshot.markers) {
            this.markerController.setMarker('start', snapshot.markers.start);
            this.markerController.setMarker('end', snapshot.markers.end);
            this.markerController.setMarker('loopStart', snapshot.markers.loopStart);
            this.markerController.setMarker('loopEnd', snapshot.markers.loopEnd);
            this.markerController.sliceMarkers = [...snapshot.sliceMarkers];
            this.markerController.updateSlicesToPad();
        }

        this.selectionStart = snapshot.selectionStart;
        this.selectionEnd = snapshot.selectionEnd;
        this.syncSourceMetadataAfterEdit();
        this.persistEditedFileToCache();
        this.render();
        return true;
    }

    undoLastEdit() {
        if (!this.history.length) {
            window.BitboxerUtils.setStatus('Nothing to undo', 'info');
            return false;
        }

        const snapshot = this.history.pop();
        const restored = this.restoreSnapshot(snapshot);
        if (restored) {
            window.BitboxerUtils.setStatus('Undo applied', 'success');
        }
        return restored;
    }

    remapSampleThroughReplace(sample, replaceStart, replaceEnd, insertLength) {
        const removedLength = replaceEnd - replaceStart;
        const delta = insertLength - removedLength;

        if (sample <= replaceStart) {
            return sample;
        }

        if (sample >= replaceEnd) {
            return sample + delta;
        }

        return replaceStart + Math.max(0, insertLength);
    }

    remapEditorStateAfterReplace(replaceStart, replaceEnd, insertLength) {
        const totalLength = this.audioEngine.audioBuffer.length;
        const clamp = (value) => Math.max(0, Math.min(totalLength, Math.floor(value)));
        const remap = (value) => clamp(this.remapSampleThroughReplace(value, replaceStart, replaceEnd, insertLength));

        if (this.markerController) {
            Object.values(this.markerController.markers).forEach((marker) => {
                marker.sample = remap(marker.sample);
            });

            this.markerController.sliceMarkers = this.markerController.sliceMarkers
                .map((sample) => remap(sample))
                .filter((sample, index, array) => sample >= 0 && sample <= totalLength && array.indexOf(sample) === index)
                .sort((a, b) => a - b);

            if (this.currentMode === '2' && !this.markerController.sliceMarkers.includes(0)) {
                this.markerController.sliceMarkers.unshift(0);
            }
        }
    }

    syncSourceMetadataAfterEdit() {
        const binding = this.getCurrentFileBinding();
        const bufferLength = this.audioEngine.audioBuffer.length;

        if (binding.isMultisampleEditor && binding.asset) {
            binding.asset.wavMetadata = binding.asset.wavMetadata || {};
            binding.asset.wavMetadata.samlen = bufferLength;
            binding.asset.wavMetadata.loopStart = this.markerController.markers.loopStart.sample;
            binding.asset.wavMetadata.loopEnd = this.markerController.markers.loopEnd.sample;
            binding.asset.wavMetadata.hasLoop = document.getElementById('multiLoopEnabled')?.value === '1';

            const startSlider = document.getElementById('multiLoopStart');
            const endSlider = document.getElementById('multiLoopEnd');
            const startValue = document.getElementById('multiLoopStart-val');
            const endValue = document.getElementById('multiLoopEnd-val');
            if (startSlider) {
                startSlider.max = bufferLength;
                startSlider.value = binding.asset.wavMetadata.loopStart;
            }
            if (endSlider) {
                endSlider.max = bufferLength;
                endSlider.value = binding.asset.wavMetadata.loopEnd;
            }
            if (startValue) startValue.textContent = binding.asset.wavMetadata.loopStart;
            if (endValue) endValue.textContent = binding.asset.wavMetadata.loopEnd;

            window._multiEditorState?.setAudioData(
                this.audioEngine.audioBuffer,
                binding.asset.wavMetadata.loopStart,
                binding.asset.wavMetadata.loopEnd,
                binding.asset.wavMetadata.hasLoop
            );
            return;
        }

        if (binding.pad) {
            this.markerController.updatePadParams();
            window.BitboxerPadEditor?.updateSliderMaxValues?.(binding.pad);
        }
    }

    persistEditedFileToCache() {
        const binding = this.getCurrentFileBinding();
        if (!binding.fileName) {
            return;
        }

        if (!window._lastImportedFiles) {
            window._lastImportedFiles = new Map();
        }

        const wavBuffer = this.encodeWavBuffer(this.audioEngine.audioBuffer);
        const editedFile = new File([wavBuffer], binding.fileName, { type: 'audio/wav' });
        window._lastImportedFiles.set(binding.fileName, editedFile);
    }

    commitEditedBuffer(newBuffer, { selectionStart = null, selectionEnd = null } = {}) {
        this.audioEngine.audioBuffer = newBuffer;
        this.audioEngine.reversedBuffer = null;
        this.renderer.setWaveformData(newBuffer);

        this.selectionStart = selectionStart;
        this.selectionEnd = selectionEnd;

        this.remapEditorStateAfterReplace(
            selectionStart ?? 0,
            selectionStart ?? 0,
            0
        );
        this.syncSourceMetadataAfterEdit();
        this.persistEditedFileToCache();
        this.render();
    }

    replaceRangeWithClipboard(replaceStart, replaceEnd, clipboardData) {
        const source = this.audioEngine.audioBuffer;
        if (!source || !clipboardData || clipboardData.length < 0) {
            return false;
        }

        const insertLength = clipboardData.length;
        const newLength = source.length - (replaceEnd - replaceStart) + insertLength;
        const channelData = [];

        for (let channel = 0; channel < source.numberOfChannels; channel++) {
            const currentChannel = source.getChannelData(channel);
            const before = currentChannel.slice(0, replaceStart);
            const after = currentChannel.slice(replaceEnd);
            const insert = clipboardData.channelData[Math.min(channel, clipboardData.channelData.length - 1)];

            const merged = new Float32Array(newLength);
            merged.set(before, 0);
            merged.set(insert, before.length);
            merged.set(after, before.length + insert.length);
            channelData.push(merged);
        }

        const newBuffer = this.createBufferFromChannels(channelData, source.sampleRate);
        this.audioEngine.audioBuffer = newBuffer;
        this.audioEngine.reversedBuffer = null;
        this.renderer.setWaveformData(newBuffer);
        this.remapEditorStateAfterReplace(replaceStart, replaceEnd, insertLength);
        this.selectionStart = replaceStart;
        this.selectionEnd = replaceStart + insertLength;
        this.syncSourceMetadataAfterEdit();
        this.persistEditedFileToCache();
        this.render();
        return true;
    }

    copySelection() {
        const range = this.getSelectionRange();
        if (!range || !this.audioEngine.audioBuffer) {
            window.BitboxerUtils.setStatus('No valid selection to copy', 'error');
            return false;
        }

        this.clipboard = this.buildClipboardFromRange(range.start, range.end);
        window.BitboxerUtils.setStatus(`Copied ${this.clipboard.length} samples`, 'success');
        return true;
    }

    cutSelection() {
        const range = this.getSelectionRange();
        if (!range || !this.audioEngine.audioBuffer) {
            window.BitboxerUtils.setStatus('No valid selection to cut', 'error');
            return false;
        }

        this.pushUndoState();
        this.clipboard = this.buildClipboardFromRange(range.start, range.end);
        const emptyClipboard = {
            sampleRate: this.audioEngine.audioBuffer.sampleRate,
            numberOfChannels: this.audioEngine.audioBuffer.numberOfChannels,
            length: 0,
            channelData: Array.from({ length: this.audioEngine.audioBuffer.numberOfChannels }, () => new Float32Array(0))
        };

        const success = this.replaceRangeWithClipboard(range.start, range.end, emptyClipboard);
        if (success) {
            this.selectionStart = range.start;
            this.selectionEnd = range.start;
            window.BitboxerUtils.setStatus(`Cut ${range.end - range.start} samples`, 'success');
        }
        return success;
    }

    cropToSelection() {
        const range = this.getSelectionRange();
        if (!range || !this.audioEngine.audioBuffer) {
            window.BitboxerUtils.setStatus('No valid selection to crop', 'error');
            return false;
        }

        this.pushUndoState();
        const source = this.audioEngine.audioBuffer;
        const channelData = [];

        for (let channel = 0; channel < source.numberOfChannels; channel++) {
            channelData.push(source.getChannelData(channel).slice(range.start, range.end));
        }

        const newBuffer = this.createBufferFromChannels(channelData, source.sampleRate);
        this.audioEngine.audioBuffer = newBuffer;
        this.audioEngine.reversedBuffer = null;
        this.renderer.setWaveformData(newBuffer);

        if (this.markerController) {
            const shiftSample = (sample) => Math.max(0, sample - range.start);
            Object.values(this.markerController.markers).forEach((marker) => {
                marker.sample = Math.max(0, Math.min(newBuffer.length, shiftSample(marker.sample)));
            });

            this.markerController.sliceMarkers = this.markerController.sliceMarkers
                .filter((sample) => sample >= range.start && sample <= range.end)
                .map((sample) => shiftSample(sample))
                .filter((sample, index, array) => array.indexOf(sample) === index)
                .sort((a, b) => a - b);

            if (this.currentMode === '2' && !this.markerController.sliceMarkers.includes(0)) {
                this.markerController.sliceMarkers.unshift(0);
            }

            this.markerController.updateSlicesToPad();
        }

        this.selectionStart = 0;
        this.selectionEnd = newBuffer.length;
        this.syncSourceMetadataAfterEdit();
        this.persistEditedFileToCache();
        this.render();
        window.BitboxerUtils.setStatus(`Cropped to ${newBuffer.length} samples`, 'success');
        return true;
    }

    duplicateSelection() {
        const range = this.getSelectionRange();
        if (!range || !this.audioEngine.audioBuffer) {
            window.BitboxerUtils.setStatus('No valid selection to duplicate', 'error');
            return false;
        }

        this.pushUndoState();
        const duplicated = this.buildClipboardFromRange(range.start, range.end);
        const success = this.replaceRangeWithClipboard(range.end, range.end, duplicated);
        if (success) {
            // Keep the original selection stable so repeated duplicate commands
            // keep cloning the same region with the same duration.
            this.selectionStart = range.start;
            this.selectionEnd = range.end;
            this.render();
            window.BitboxerUtils.setStatus(`Duplicated ${duplicated.length} samples`, 'success');
        }
        return success;
    }

    pasteClipboard() {
        if (!this.clipboard || !this.audioEngine.audioBuffer) {
            window.BitboxerUtils.setStatus('Clipboard is empty', 'error');
            return false;
        }

        this.pushUndoState();
        const range = this.getSelectionRange({ requireLength: false });
        const insertAt = range ? range.start : 0;
        const replaceEnd = range ? range.end : insertAt;
        const success = this.replaceRangeWithClipboard(insertAt, replaceEnd, this.clipboard);
        if (success) {
            window.BitboxerUtils.setStatus(`Pasted ${this.clipboard.length} samples`, 'success');
        }
        return success;
    }

    pasteClipboardAt(sample) {
        if (!this.clipboard || !this.audioEngine.audioBuffer) {
            window.BitboxerUtils.setStatus('Clipboard is empty', 'error');
            return false;
        }

        const insertAt = Math.max(0, Math.min(this.audioEngine.audioBuffer.length, Math.floor(sample)));
        this.pushUndoState();
        const success = this.replaceRangeWithClipboard(insertAt, insertAt, this.clipboard);
        if (success) {
            window.BitboxerUtils.setStatus(`Pasted ${this.clipboard.length} samples at cursor`, 'success');
        }
        return success;
    }

    scheduleRender() {
        if (this._renderScheduled) return;
        
        this._renderScheduled = true;
        requestAnimationFrame(() => {
            this._renderScheduled = false;
            this.render();
        });
    }

    setupEventListeners(canvas) {
        // Only skip if listeners are attached to THIS SAME canvas
        if (this._eventListenersAttached && this._attachedCanvas === canvas) {
            console.log('Event listeners already attached to this canvas');
            return;
        }

        // Mark this canvas as having listeners attached
        this._eventListenersAttached = true;
        this._attachedCanvas = canvas;

        // Mouse state variables
        let isDragging = false;
        let isSelecting = false;
        let lastMouseX = null;
        let lastMouseY = null;
        const stopCanvasPropagation = (e) => {
            e.stopPropagation();
        };
        const finishPointerInteraction = () => {
            let endedInteraction = false;
            if (isDragging) {
                endedInteraction = true;
                if (this.draggingSelectionMarker) {
                    if (this.selectionStart > this.selectionEnd) {
                        [this.selectionStart, this.selectionEnd] = [this.selectionEnd, this.selectionStart];
                    }

                    if (this.markerController.snapToZeroCrossingEnabled && this.renderer.waveformData) {
                        const channelData = this.renderer.waveformData.channelData[0];
                        this.selectionStart = this.markerController.findZeroCrossing(this.selectionStart, channelData);
                        this.selectionEnd = this.markerController.findZeroCrossing(this.selectionEnd, channelData);
                    }

                    console.log(`Selection marker dragged: ${this.selectionStart} to ${this.selectionEnd}`);
                    this.draggingSelectionMarker = null;
                } else {
                    this.markerController.handleMouseUp();
                }
                isDragging = false;
                this.render();
                console.log('Stopped dragging');
                this.suppressModalClose();
                return;
            }

            if (isSelecting) {
                endedInteraction = true;
                isSelecting = false;

                if (this.selectionStart > this.selectionEnd) {
                    [this.selectionStart, this.selectionEnd] = [this.selectionEnd, this.selectionStart];
                }

                if (this.markerController.snapToZeroCrossingEnabled && this.renderer.waveformData) {
                    const channelData = this.renderer.waveformData.channelData[0];
                    this.selectionStart = this.markerController.findZeroCrossing(this.selectionStart, channelData);
                    this.selectionEnd = this.markerController.findZeroCrossing(this.selectionEnd, channelData);
                }

                console.log(`Selection finalized: ${this.selectionStart} to ${this.selectionEnd}`);
                this.render();
            }

            if (endedInteraction) {
                this.suppressModalClose();
            }
        };

        ['mousedown', 'mousemove', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel'].forEach((eventName) => {
            canvas.addEventListener(eventName, stopCanvasPropagation);
        });

        // ==================== MOUSEDOWN ====================
        canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            canvas.focus();
            this.suppressModalClose();

            // Reset mouse tracking
            lastMouseX = null;
            lastMouseY = null;

            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Get current mode
            const { currentEditingPad, presetData } = window.BitboxerData;
            let currentMode = '0';
            if (currentEditingPad) {
                const row = parseInt(currentEditingPad.dataset.row);
                const col = parseInt(currentEditingPad.dataset.col);
                currentMode = presetData.pads[row][col].params.cellmode || '0';
            }

            // LEFT CLICK (button 0)
            if (e.button === 0) {
                // Check if clicking on selection markers first (if selection exists)
                if (this.selectionStart !== null && this.selectionEnd !== null) {
                    const threshold = 10;
                    const startX = this.renderer.sampleToX(this.selectionStart);
                    const endX = this.renderer.sampleToX(this.selectionEnd);

                    if (Math.abs(x - startX) < threshold) {
                        // Clicked on selection start marker
                        isDragging = true;
                        this.draggingSelectionMarker = 'start';
                        console.log('Dragging selection start');
                        return;
                    } else if (Math.abs(x - endX) < threshold) {
                        // Clicked on selection end marker
                        isDragging = true;
                        this.draggingSelectionMarker = 'end';
                        console.log('Dragging selection end');
                        return;
                    }
                }

                // Try to grab a pad marker
                if (this.markerController.handleMouseDown(x, y, currentMode, e.shiftKey)) {
                    isDragging = true;
                    this.draggingSelectionMarker = null;
                    console.log('Started dragging marker');
                } else {
                    // No marker grabbed - start selection
                    isSelecting = true;
                    this.draggingSelectionMarker = null;
                    const startSample = this.renderer.xToSample(x);
                    this.selectionStart = startSample;
                    this.selectionEnd = startSample;
                    console.log(`Selection started at sample ${startSample}`);
                }
            }
        });

        // ==================== MOUSEMOVE ====================
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
        
            // ALWAYS update cursor (don't skip based on movement threshold)
            // This ensures cursor updates even with tiny mouse movements

            if (isDragging) {
                // DRAGGING MODE: Handle marker/selection movement
                // Check if mouse actually moved (for performance)
                const moved = (lastMouseX === null || Math.abs(x - lastMouseX) > 1 || Math.abs(y - lastMouseY) > 1);
                lastMouseX = x;
                lastMouseY = y;

                if (!moved) return;

                if (this.draggingSelectionMarker) {
                    // Dragging selection marker
                    const sample = this.renderer.xToSample(x);
                    if (this.draggingSelectionMarker === 'start') {
                        this.selectionStart = sample;
                    } else {
                        this.selectionEnd = sample;
                    }
                    this.render();
                } else {
                    // Dragging pad marker
                    if (this.markerController.handleMouseMove(x)) {
                        this.render();
                    }
                }
            } else if (isSelecting) {
                // SELECTING MODE: Creating new selection
                const moved = (lastMouseX === null || Math.abs(x - lastMouseX) > 1 || Math.abs(y - lastMouseY) > 1);
                lastMouseX = x;
                lastMouseY = y;

                if (!moved) return;

                const endSample = this.renderer.xToSample(x);
                this.selectionEnd = endSample;
                this.render();
            }

            // ALWAYS check for hover cursor (even during drag/select for smooth transitions)
            // This runs independently of drag state
            let isOverHandle = false;
            const selectionThreshold = 10; // Selection markers: wider detection
            const standardThreshold = 5;   // Standard markers: must be in handle (±5px from center)
            const sliceThreshold = 3;      // Slice markers: smallest handles (±3px from center)

            // Get current mode
            const { currentEditingPad, presetData } = window.BitboxerData;
            let currentMode = '0';
            if (currentEditingPad) {
                const row = parseInt(currentEditingPad.dataset.row);
                const col = parseInt(currentEditingPad.dataset.col);
                currentMode = presetData.pads[row][col].params.cellmode || '0';
            }

            // 1. Check selection markers ANYWHERE on vertical line (if selection exists)
            if (this.selectionStart !== null && this.selectionEnd !== null) {
                const startX = this.renderer.sampleToX(this.selectionStart);
                const endX = this.renderer.sampleToX(this.selectionEnd);

                if (Math.abs(x - startX) < selectionThreshold || Math.abs(x - endX) < selectionThreshold) {
                    isOverHandle = true;
                }
            }

            // 2. Check standard markers in sample/granular modes (STRICT: in handle zone only)
            if (!isOverHandle && (currentMode === '0' || currentMode === '3')) {
                for (const [name, marker] of Object.entries(this.markerController.markers)) {
                    const markerX = this.renderer.sampleToX(marker.sample);

                    if (Math.abs(x - markerX) < standardThreshold) {
                        // STRICT: Check if in correct vertical zone for this marker
                        const isLoopMarker = (name === 'loopStart' || name === 'loopEnd');

                        if (isLoopMarker) {
                            // Loop markers: bottom 20px only
                            if (y >= this.renderer.height - 20) {
                                isOverHandle = true;
                                break;
                            }
                        } else {
                            // Start/End markers: top 20px only
                            if (y <= 20) {
                                isOverHandle = true;
                                break;
                            }
                        }
                    }
                }
            }

            // 3. Check slice markers in slicer mode (STRICT: top 15px only)
            if (!isOverHandle && currentMode === '2') {
                for (let i = 0; i < this.markerController.sliceMarkers.length; i++) {
                    const markerX = this.renderer.sampleToX(this.markerController.sliceMarkers[i]);
                    if (Math.abs(x - markerX) < sliceThreshold && y <= 15) {
                        isOverHandle = true;
                        break;
                    }
                }
            }

            // Update cursor - ALWAYS, regardless of drag state
            canvas.style.cursor = isOverHandle ? 'ew-resize' : 'crosshair';
        });

        // ==================== MOUSE ENTER/LEAVE ====================
        canvas.addEventListener('mouseenter', () => {
            canvas.style.cursor = 'crosshair';
        });

        canvas.addEventListener('mouseleave', () => {
            canvas.style.cursor = 'default';
            // Reset tracking
            lastMouseX = null;
            lastMouseY = null;
        });

        // ==================== MOUSEUP ====================
        canvas.addEventListener('mouseup', (e) => {
            finishPointerInteraction();
        });

        window.addEventListener('mouseup', () => {
            finishPointerInteraction();
        });

        window.addEventListener('blur', () => {
            finishPointerInteraction();
        });

        // ==================== RIGHT-CLICK (CONTEXTMENU) ====================
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const clickSample = this.renderer.xToSample(x);
            this.contextCursorSample = clickSample;
        
            // Get current mode
            const { currentEditingPad, presetData } = window.BitboxerData;
            let currentMode = '0';
            if (currentEditingPad) {
                const row = parseInt(currentEditingPad.dataset.row);
                const col = parseInt(currentEditingPad.dataset.col);
                currentMode = presetData.pads[row][col].params.cellmode || '0';
            }
        
            // SLICER MODE: Handle slice marker deletion/addition
            if (currentMode === '2') {
                // Check if clicking on existing marker (delete it)
                const threshold = 10;
                for (let i = 0; i < this.markerController.sliceMarkers.length; i++) {
                    const markerX = this.renderer.sampleToX(this.markerController.sliceMarkers[i]);
                    if (Math.abs(x - markerX) < threshold) {
                        // Delete marker
                        this.markerController.removeSliceAtIndex(i);
                        this.render();
                        return;
                    }
                }
            
                // Check if clicking within selection (add slices at boundaries)
                if (this.selectionStart !== null && this.selectionEnd !== null &&
                    clickSample >= this.selectionStart && clickSample <= this.selectionEnd) {
                    
                    this.showSliceContextMenu(e.pageX, e.pageY);
                    return;
                }

                this.showWaveformContextMenu(e.pageX, e.pageY, { hasSelection: false });
                return;
            } 
            // NORMAL MODES (Sample/Granular): Show selection context menu
            else if (currentMode === '0' || currentMode === '3') {
                // Check if we have a valid selection
                if (this.selectionStart !== null && this.selectionEnd !== null &&
                    !isNaN(this.selectionStart) && !isNaN(this.selectionEnd)) {
                    
                    // Ensure selection is ordered
                    const selStart = Math.min(this.selectionStart, this.selectionEnd);
                    const selEnd = Math.max(this.selectionStart, this.selectionEnd);
                    
                    // Check if click is within selection
                    if (clickSample >= selStart && clickSample <= selEnd) {
                        this.showSelectionContextMenu(e.pageX, e.pageY, selStart, selEnd);
                        return;
                    }
                }
            }

            this.showWaveformContextMenu(e.pageX, e.pageY, {
                hasSelection: !!this.getSelectionRange()
            });
        });

        // ==================== MOUSE WHEEL (ZOOM) ====================
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();

            // CRITICAL: Clear selection flag to prevent mousemove from updating selection
            isSelecting = false;

            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;

            // Keep selection anchored in absolute sample coordinates and zoom toward
            // the actual pointer position. Re-centering on selection makes the
            // viewport jump, which looks like the selection itself is moving.
            this.zoomController.handleWheel(e.deltaY, x, {
                deltaMode: e.deltaMode,
                shiftKey: e.shiftKey
            });
        });

        canvas.addEventListener('keydown', (e) => {
            const accel = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();

            if (e.code === 'Space' || key === ' ') {
                e.preventDefault();
                if (this === window._multiSampleEditor && this.audioEngine.audioBuffer) {
                    this.stop();
                    this.audioEngine.play({
                        startSample: 0,
                        endSample: this.audioEngine.audioBuffer.length,
                        loopEnabled: false,
                        reverse: false
                    });
                    this.startPlaybackAnimation();
                } else {
                    this.play();
                }
                return;
            }

            if (!accel) {
                return;
            }

            if (key === 'c') {
                e.preventDefault();
                this.copySelection();
            } else if (key === 'x') {
                e.preventDefault();
                this.cutSelection();
            } else if (key === 'v') {
                e.preventDefault();
                this.pasteClipboard();
            } else if (key === 'z') {
                e.preventDefault();
                this.undoLastEdit();
            }
        });

        // ==================== WINDOW RESIZE ====================
        window.addEventListener('resize', () => {
            this.renderer.resize();
            this.render();
        });
    }

    showSliceContextMenu(pageX, pageY) {
        // Remove any existing context menu
        const existing = document.getElementById('sliceContextMenu');
        if (existing) existing.remove();
        
        // Create context menu
        const menu = document.createElement('div');
        menu.id = 'sliceContextMenu';
        menu.className = 'context-menu show';
        menu.style.left = pageX + 'px';
        menu.style.top = pageY + 'px';
        
        menu.innerHTML = `
            <div class="context-item" data-action="start">Add slice at selection start</div>
            <div class="context-item" data-action="end">Add slice at selection end</div>
            <div class="context-item" data-action="both">Add slices at both</div>
            <div class="context-item separator"></div>
            <div class="context-item" data-action="cancel">Cancel</div>
        `;
        
        document.body.appendChild(menu);
        
        // Handle menu clicks
        menu.addEventListener('click', (e) => {
            const action = e.target.dataset.action;

            if (action === 'start') {
                this.markerController.addSliceAtSample(this.selectionStart);
            } else if (action === 'end') {
                this.markerController.addSliceAtSample(this.selectionEnd);
            } else if (action === 'both') {
                this.markerController.addSliceAtSample(this.selectionStart);
                this.markerController.addSliceAtSample(this.selectionEnd);
            }

            // Remove menu
            menu.remove();

            // Re-render if slices were added
            if (action !== 'cancel') {
                this.render();
            }
        });

        // Close menu on any other click
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    showWaveformContextMenu(pageX, pageY, { hasSelection = false } = {}) {
        const existing = document.getElementById('waveformContextMenu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.id = 'waveformContextMenu';
        menu.className = 'context-menu show';
        menu.style.position = 'fixed';
        menu.style.left = pageX + 'px';
        menu.style.top = pageY + 'px';
        menu.style.zIndex = '2001';

        menu.innerHTML = `
            <div class="context-item" data-action="paste-at-cursor">Paste at cursor</div>
            <div class="context-item" data-action="play-from-start">Play from start</div>
            <div class="context-item" data-action="undo-edit">Undo last edit</div>
            ${hasSelection ? '<div class="context-item separator"></div><div class="context-item" data-action="copy-selection">Copy selection</div><div class="context-item" data-action="cut-selection">Cut selection</div>' : ''}
            <div class="context-item separator"></div>
            <div class="context-item" data-action="cancel">Cancel</div>
        `;

        document.body.appendChild(menu);

        menu.addEventListener('click', (e) => {
            const action = e.target.dataset.action;

            if (action === 'paste-at-cursor') {
                this.pasteClipboardAt(this.contextCursorSample);
            } else if (action === 'play-from-start') {
                if (this === window._multiSampleEditor && this.audioEngine.audioBuffer) {
                    this.stop();
                    this.audioEngine.play({
                        startSample: 0,
                        endSample: this.audioEngine.audioBuffer.length,
                        loopEnabled: false,
                        reverse: false
                    });
                    this.startPlaybackAnimation();
                } else {
                    this.play();
                }
            } else if (action === 'undo-edit') {
                this.undoLastEdit();
            } else if (action === 'copy-selection') {
                this.copySelection();
            } else if (action === 'cut-selection') {
                this.cutSelection();
            }

            menu.remove();

            if (action !== 'cancel') {
                this.render();
            }
        });

        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };

        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    /**
     * Shows context menu for setting markers from selection
     * @param {number} pageX - Mouse X position in page coordinates
     * @param {number} pageY - Mouse Y position in page coordinates
     * @param {number} selStart - Selection start sample
     * @param {number} selEnd - Selection end sample
     */
    showSelectionContextMenu(pageX, pageY, selStart, selEnd) {
        // Remove any existing context menu
        const existing = document.getElementById('selectionContextMenu');
        if (existing) existing.remove();

        // Apply snap-to-zero-crossing if enabled
        const applySnap = (sample) => {
            if (!this.markerController.snapToZeroCrossingEnabled) {
                return sample;
            }

            const channelData = this.renderer.waveformData.channelData[0];
            return this.markerController.findZeroCrossing(sample, channelData);
        };

        // Snap selection boundaries if toggle is enabled
        const snappedStart = applySnap(selStart);
        const snappedEnd = applySnap(selEnd);

        // Create context menu
        const menu = document.createElement('div');
        menu.id = 'selectionContextMenu';
        menu.className = 'context-menu show';
        menu.style.position = 'fixed';
        menu.style.left = pageX + 'px';
        menu.style.top = pageY + 'px';
        menu.style.zIndex = '2001';

        // Detect if in multisample mode (check if we're using _multiSampleEditor)
        const isMultisampleMode = (this === window._multiSampleEditor);

        let menuItems = '';

        menuItems += `
            <div class="context-item" data-action="copy-selection">Copy selection</div>
            <div class="context-item" data-action="cut-selection">Cut selection</div>
            <div class="context-item" data-action="paste-selection">Paste at selection</div>
            <div class="context-item" data-action="duplicate-selection">Duplicate selection</div>
            <div class="context-item" data-action="crop-selection">Crop to selection</div>
            <div class="context-item" data-action="undo-edit">Undo last edit</div>
            <div class="context-item separator"></div>
        `;

        if (!isMultisampleMode) {
            // Normal mode: show sample start/end options
            menuItems += `
                <div class="context-item" data-action="sample-start">Set sample start</div>
                <div class="context-item" data-action="sample-end">Set sample end</div>
                <div class="context-item" data-action="sample-both">Set sample start & end</div>
                <div class="context-item separator"></div>
            `;
        }

        // Always show loop options
        menuItems += `
            <div class="context-item" data-action="loop-start">Set loop start</div>
            <div class="context-item" data-action="loop-end">Set loop end</div>
            <div class="context-item" data-action="loop-both">Set loop start & end</div>
            <div class="context-item separator"></div>
            <div class="context-item" data-action="cancel">Cancel</div>
        `;

        menu.innerHTML = menuItems;

        document.body.appendChild(menu);

        // Handle menu clicks
        menu.addEventListener('click', (e) => {
            const action = e.target.dataset.action;

            if (action === 'copy-selection') {
                this.copySelection();
            } else if (action === 'cut-selection') {
                this.cutSelection();
            } else if (action === 'paste-selection') {
                this.pasteClipboard();
            } else if (action === 'duplicate-selection') {
                this.duplicateSelection();
            } else if (action === 'crop-selection') {
                this.cropToSelection();
            } else if (action === 'undo-edit') {
                this.undoLastEdit();
            } else if (action === 'sample-start') {
                this.markerController.setMarker('start', snappedStart);
                this.markerController.updatePadParams();
            } else if (action === 'sample-end') {
                this.markerController.setMarker('end', snappedEnd);
                this.markerController.updatePadParams();
            } else if (action === 'sample-both') {
                this.markerController.setMarker('start', snappedStart);
                this.markerController.setMarker('end', snappedEnd);
                this.markerController.updatePadParams();
            } else if (action === 'loop-start') {
                this.markerController.setMarker('loopStart', snappedStart);
                this.markerController.updatePadParams();
            } else if (action === 'loop-end') {
                this.markerController.setMarker('loopEnd', snappedEnd);
                this.markerController.updatePadParams();
            } else if (action === 'loop-both') {
                this.markerController.setMarker('loopStart', snappedStart);
                this.markerController.setMarker('loopEnd', snappedEnd);
                this.markerController.updatePadParams();
            }

            // Remove menu
            menu.remove();

            // Re-render if markers were changed
            if (action !== 'cancel') {
                this.render();
                if (!['copy-selection', 'cut-selection', 'paste-selection', 'duplicate-selection', 'crop-selection', 'undo-edit'].includes(action)) {
                    const snapStatus = this.markerController.snapToZeroCrossingEnabled ? ' (snapped)' : '';
                    window.BitboxerUtils.setStatus(`Markers updated from selection${snapStatus}`, 'success');
                }
            }
        });

        // Close menu on any other click
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };

        // Delay to prevent immediate closure from the same click event
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    async loadSample(wavFile) {
        try {
            const arrayBuffer = await wavFile.arrayBuffer();
            const audioBuffer = await this.audioEngine.loadAudio(arrayBuffer);
            this.renderer.setWaveformData(audioBuffer);
            
            // Sync markers from pad params
            const { currentEditingPad, presetData } = window.BitboxerData;
            if (currentEditingPad) {
                const row = parseInt(currentEditingPad.dataset.row);
                const col = parseInt(currentEditingPad.dataset.col);
                const pad = presetData.pads[row][col];
                this.markerController.syncFromPadParams(pad);
            }

            this.render();

            // Update slider max values now that we have actual audio buffer
            // const { currentEditingPad, presetData } = window.BitboxerData;
            if (currentEditingPad) {
                const row = parseInt(currentEditingPad.dataset.row);
                const col = parseInt(currentEditingPad.dataset.col);
                const pad = presetData.pads[row][col];
                window.BitboxerPadEditor.updateSliderMaxValues(pad);
            }

            return true;
        } catch (error) {
            console.error('Failed to load sample:', error);
            return false;
        }
    }

    setScroll(scrollRatio) {
        if (!this.renderer || !this.renderer.waveformData) return;
        
        const totalSamples = this.renderer.waveformData.length;
        const visibleSamples = Math.floor(totalSamples / this.renderer.zoom);
        const maxScrollSample = Math.max(0, totalSamples - visibleSamples);
        
        // Convert ratio (0-1) to integer sample position
        this.renderer.scrollSample = Math.floor(scrollRatio * maxScrollSample);
        this.render();
    }

    render() {
        // CRITICAL: Don't render if canvas width is invalid
        if (!this.renderer || !this.renderer.width || this.renderer.width <= 0) {
            return; // Canvas not ready, skip render
        }

        this.renderer.render();
        this.markerController.draw();

        // Update scroll-zoom bar
        if (this.scrollZoomBar) {
            this.scrollZoomBar.render();
        }

        // Draw mode-specific overlays
        const { currentEditingPad, presetData } = window.BitboxerData;
        if (!currentEditingPad) return;

        const row = parseInt(currentEditingPad.dataset.row);
        const col = parseInt(currentEditingPad.dataset.col);
        const pad = presetData.pads[row][col];

        if (this.currentMode === '1') {
            const tempo = presetData.tempo || '120';
            this.markerController.drawClipBeatGrid(pad.params, tempo);
        } else if (this.currentMode === '3') {
            this.markerController.drawGranularOverlay(pad.params);
        }

        // Draw selection overlay if exists
        if (this.selectionStart !== null && this.selectionEnd !== null &&
            !isNaN(this.selectionStart) && !isNaN(this.selectionEnd)) {
            const ctx = this.renderer.ctx;
            const themeColors = this.renderer.getThemeColors();
            const x1 = this.renderer.sampleToX(this.selectionStart);
            const x2 = this.renderer.sampleToX(this.selectionEnd);
            const width = this.renderer.width;
            const height = this.renderer.height;

            // Draw selection highlight
            ctx.fillStyle = themeColors.beatGridSubtle;
            ctx.fillRect(x1, 0, x2 - x1, height);

            // Draw selection borders
            ctx.strokeStyle = themeColors.markerLoop;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x1, 0);
            ctx.lineTo(x1, height);
            ctx.moveTo(x2, 0);
            ctx.lineTo(x2, height);
            ctx.stroke();
        }

        // Draw playback position if playing
        if (this.audioEngine.isPlaying) {
            const currentSample = this.audioEngine.getCurrentSample();
            if (!isNaN(currentSample) && currentSample >= 0) {
                const x = this.renderer.sampleToX(currentSample);
                const ctx = this.renderer.ctx;
                const themeColors = this.renderer.getThemeColors();
                const height = this.renderer.height;
                const width = this.renderer.width;

                // Only draw if within visible area (simple check)
                if (x >= -10 && x <= width + 10) {
                    ctx.strokeStyle = themeColors.markerSlice;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, height);
                    ctx.stroke();
                }
            }
        }  
    }

    /**
     * Shows context menu for adding slice markers at selection boundaries
     * @param {number} pageX - Mouse X position in page coordinates
     * @param {number} pageY - Mouse Y position in page coordinates
     */
    showSliceContextMenu(pageX, pageY) {
        // Remove any existing context menu
        const existing = document.getElementById('sliceContextMenu');
        if (existing) existing.remove();
        
        // Create context menu
        const menu = document.createElement('div');
        menu.id = 'sliceContextMenu';
        menu.className = 'context-menu show';
        menu.style.position = 'fixed';
        menu.style.left = pageX + 'px';
        menu.style.top = pageY + 'px';
        menu.style.zIndex = '2001';
        
        menu.innerHTML = `
            <div class="context-item" data-action="start">Add slice at selection start</div>
            <div class="context-item" data-action="end">Add slice at selection end</div>
            <div class="context-item" data-action="both">Add slices at both</div>
            <div class="context-item separator"></div>
            <div class="context-item" data-action="cancel">Cancel</div>
        `;
        
        document.body.appendChild(menu);
        
        // Handle menu clicks
        menu.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            
            if (action === 'start' || action === 'both') {
                this.markerController.addSliceAtSample(this.selectionStart);
            }
            
            if (action === 'end' || action === 'both') {
                this.markerController.addSliceAtSample(this.selectionEnd);
            }
            
            // Remove menu
            menu.remove();
            
            // Re-render if slices were added
            if (action !== 'cancel') {
                this.render();
            }
        });
        
        // Close menu on any other click
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        
        // Delay to prevent immediate closure from the same click event
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    setMode(mode) {
        this.currentMode = mode;
        
        // Single render to update display
        this.render();
    }

    play() {
        const { currentEditingPad, presetData } = window.BitboxerData;
        if (!currentEditingPad) return;

        const row = parseInt(currentEditingPad.dataset.row);
        const col = parseInt(currentEditingPad.dataset.col);
        const pad = presetData.pads[row][col];

        // Parse loop mode correctly
        const loopmodes = parseInt(pad.params.loopmodes) || 0;
        const loopEnabled = (loopmodes === 1 || loopmodes === 2);  // 1=Forward, 2=Bidirectional
        
        // Log for debugging
        console.log('Play params:', {
            loopmodes: pad.params.loopmodes,
            loopEnabled,
            loopstart: pad.params.loopstart,
            loopend: pad.params.loopend
        });

        const samstart = parseInt(pad.params.samstart) || 0;
        const samlen = parseInt(pad.params.samlen) || this.audioEngine.audioBuffer.length;

        const params = {
            startSample: samstart,
            endSample: samstart + samlen,
            loopStartSample: parseInt(pad.params.loopstart) || 0,
            loopEndSample: parseInt(pad.params.loopend) || samlen,
            loopEnabled: loopEnabled,
            reverse: false  // Disabled
        };

        this.audioEngine.play(params);
        this.startPlaybackAnimation();
    }

    stop() {
        this.audioEngine.stop();
    }

    playSelection() {
        // Validate selection exists and is valid
        if (this.selectionStart === null || isNaN(this.selectionStart) || this.selectionStart < 0) {
            console.warn('No valid selection to play');
            window.BitboxerUtils.setStatus('No selection - drag in waveform to select', 'error');
            return;
        }

        const { currentEditingPad, presetData } = window.BitboxerData;
        if (!currentEditingPad) return;

        const row = parseInt(currentEditingPad.dataset.row);
        const col = parseInt(currentEditingPad.dataset.col);
        const pad = presetData.pads[row][col];

        // Calculate valid end point
        let endSample;
        const bufferLength = this.audioEngine.audioBuffer.length;

        if (this.selectionEnd === null || isNaN(this.selectionEnd) || 
            Math.abs(this.selectionStart - this.selectionEnd) < 100) {
            // Single-point selection - play to buffer end
            endSample = bufferLength;
            console.log(`Playing from point ${this.selectionStart} to end ${endSample}`);
        } else {
            // Ensure selection is in correct order
            const start = Math.min(this.selectionStart, this.selectionEnd);
            const end = Math.max(this.selectionStart, this.selectionEnd);

            this.selectionStart = start;
            endSample = end;
            console.log(`Playing selection: ${this.selectionStart} to ${endSample}`);
        }

        // Validate range before playing
        if (this.selectionStart >= endSample || this.selectionStart >= bufferLength) {
            window.BitboxerUtils.setStatus('Invalid selection range', 'error');
            return;
        }

        // Clamp end to buffer length
        endSample = Math.min(endSample, bufferLength);

        this.audioEngine.play({
            startSample: Math.floor(this.selectionStart),
            endSample: Math.floor(endSample),
            loopEnabled: false,
            reverse: false
        });

        this.startPlaybackAnimation();
    }

    startPlaybackAnimation() {
        if (this.playbackAnimationFrame) {
            cancelAnimationFrame(this.playbackAnimationFrame);
        }

        const animate = () => {
            if (!this.audioEngine.isPlaying) {
                this.playbackAnimationFrame = null;
                if (this.renderer && this.renderer.width > 0) {
                    this.render();
                }
                return;
            }

            // Only render if canvas is ready
            if (this.renderer && this.renderer.width > 0) {
                this.render();
            }

            this.playbackAnimationFrame = requestAnimationFrame(animate);
        };

        this.playbackAnimationFrame = requestAnimationFrame(animate);
    }

    playSlice(sliceIndex) {
        if (!this.markerController.sliceMarkers.length) return;

        const slices = this.markerController.sliceMarkers;
        const startSample = slices[sliceIndex];
        const endSample = slices[sliceIndex + 1] || this.audioEngine.audioBuffer.length;

        this.audioEngine.play({
            startSample,
            endSample,
            loopEnabled: false,
            reverse: false
        });
    }

    autoDetectSlices(algorithm = 'flux', sensitivity = 0.5, minSliceDistance = 1000) {
        this.markerController.autoDetectSlices(algorithm, sensitivity, minSliceDistance);
        this.render();
    }

    setZoom(zoom) {
        this.zoomController.setZoom(zoom);
        this.render();
    }

    setScroll(scroll) {
        this.zoomController.setScroll(scroll);
        this.render();
    }
}

// ============================================
// EXPORT
// ============================================
window.BitboxerSampleEditor = new SampleEditor();
