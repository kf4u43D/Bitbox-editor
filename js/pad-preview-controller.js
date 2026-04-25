(function () {
    class PadPreviewController {
        constructor({ defaultGain = 0.45, maxDurationSeconds = 8 } = {}) {
            this.audioContext = null;
            this.defaultGain = defaultGain;
            this.maxDurationSeconds = maxDurationSeconds;
            this.activeSource = null;
            this.activePad = null;
            this.stopButtonId = 'stopPreviewBtn';
            this.previewClassName = 'preview-playing';
        }

        async ensureContext() {
            if (!this.audioContext) {
                const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextCtor) {
                    throw new Error('Web Audio API unavailable');
                }
                this.audioContext = new AudioContextCtor();
            }

            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            return this.audioContext;
        }

        getPadData(padElement) {
            if (!padElement || !window.BitboxerData?.presetData) return null;

            const row = parseInt(padElement.dataset.row, 10);
            const col = parseInt(padElement.dataset.col, 10);

            if (Number.isNaN(row) || Number.isNaN(col)) return null;
            return window.BitboxerData.presetData.pads[row]?.[col] ?? null;
        }

        isPreviewablePadData(padData) {
            if (!padData) return false;
            if (padData.type !== 'sample') return false;
            if (!padData.filename) return false;
            if (padData.params?.multisammode === '1') return false;
            return true;
        }

        isPreviewablePad(padElement) {
            return this.isPreviewablePadData(this.getPadData(padElement));
        }

        async resolvePadFile(filename) {
            if (!filename || !window._lastImportedFiles) {
                return null;
            }

            if (window._lastImportedFiles.has(filename)) {
                return window._lastImportedFiles.get(filename);
            }

            const targetName = filename.split(/[/\\]/).pop().toLowerCase();
            for (const [path, file] of window._lastImportedFiles.entries()) {
                const candidateName = path.split(/[/\\]/).pop().toLowerCase();
                if (candidateName === targetName) {
                    return file;
                }
            }

            return null;
        }

        setPlayingPad(padElement) {
            this.clearPlayingPad();
            this.activePad = padElement;
            if (this.activePad) {
                this.activePad.classList.add(this.previewClassName);
            }
            this.syncStopButton();
        }

        clearPlayingPad() {
            if (this.activePad) {
                this.activePad.classList.remove(this.previewClassName);
            }
            this.activePad = null;
            this.syncStopButton();
        }

        syncStopButton() {
            const stopButton = document.getElementById(this.stopButtonId);
            if (stopButton) {
                stopButton.disabled = !this.activeSource;
            }
        }

        stopAll() {
            if (this.activeSource) {
                try {
                    this.activeSource.onended = null;
                    this.activeSource.stop();
                } catch {
                    // no-op
                }
            }

            this.activeSource = null;
            this.clearPlayingPad();
        }

        async previewPad(padElement) {
            const padData = this.getPadData(padElement);
            if (!this.isPreviewablePadData(padData)) {
                window.BitboxerUtils?.setStatus('Pad preview unavailable for this pad', 'error');
                return false;
            }

            const file = await this.resolvePadFile(padData.filename);
            if (!file) {
                window.BitboxerUtils?.setStatus('Sample not cached locally for preview', 'error');
                return false;
            }

            const context = await this.ensureContext();
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));

            this.stopAll();

            const source = context.createBufferSource();
            const gainNode = context.createGain();
            source.buffer = audioBuffer;
            gainNode.gain.value = this.defaultGain;
            source.connect(gainNode);
            gainNode.connect(context.destination);

            source.onended = () => {
                if (this.activeSource === source) {
                    this.activeSource = null;
                    this.clearPlayingPad();
                }
            };

            this.activeSource = source;
            this.setPlayingPad(padElement);

            const durationSeconds = Math.min(audioBuffer.duration, this.maxDurationSeconds);
            source.start(0, 0, durationSeconds);

            const label = padData.filename.split(/[/\\]/).pop();
            window.BitboxerUtils?.setStatus(`Preview: ${label}`, 'info');
            return true;
        }
    }

    window.BitboxerPadPreview = new PadPreviewController();
})();
