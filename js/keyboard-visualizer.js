/**
 * BITBOXER - Keyboard Visualizer with Draggable Zones
 * 
 * FEATURES:
 * - Draggable zone edges (resize)
 * - Draggable zone body (move)
 * - Collision detection & prevention
 * - Real-time visual feedback
 * - Snap guides
 * - Zoom & scroll functionality
 */

class KeyboardVisualizer {
    constructor(canvasId, scrollCanvasId) {
        this.canvas = document.getElementById(canvasId);
        this.scrollCanvas = document.getElementById(scrollCanvasId);

        // Zoom capability
        this.zoom = 0.5;
        this.minZoom = 0.25;
        this.maxZoom = 4;

        if (!this.canvas || !this.scrollCanvas) {
            console.error('KeyboardVisualizer: Canvas elements not found');
            return;
        }

        this.ctx = this.canvas.getContext('2d');
        this.scrollCtx = this.scrollCanvas.getContext('2d');

        // Configuration
        this.keyWidth = 16;
        this.keyHeight = 100;
        this.velocityPanelHeight = 140;
        this.velocityEdgeThreshold = 10;
        this.minKey = 0;
        this.maxKey = 127;
        this.totalKeys = this.maxKey - this.minKey + 1;

        // State
        this.assetCells = [];
        this.selectedAsset = null;
        this.scrollPos = 0;
        this.maxScroll = 0;
        this.hoveredKey = null;
        this._pendingDrag = null;

        // Drag state
        this.dragState = {
            active: false,
            type: null,
            asset: null,
            startX: 0,
            startY: 0,
            startKeyLo: 0,
            startKeyHi: 0,
            startRootNote: 0,
            startVelLo: 0,
            startVelHi: 0,
            currentKeyLo: 0,
            currentKeyHi: 0,
            currentVelLo: 0,
            currentVelHi: 0,
            previewKeyLo: 0,
            previewKeyHi: 0,
            previewVelLo: 0,
            previewVelHi: 0,
            neighborLeft: null,
            neighborRight: null,
            snapGuideKey: null
        };

        this.colors = this.getThemeColors();

        this.resize();
        this.setupEventListeners();
        window.addEventListener('bitboxer:themechange', () => {
            this.colors = this.getThemeColors();
            this.render();
        });
    }

    getCssVar(name, fallback) {
        try {
            const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            return value || fallback;
        } catch {
            return fallback;
        }
    }

    withAlpha(color, alpha) {
        if (!color) return `rgba(0, 0, 0, ${alpha})`;

        const normalized = color.trim();
        if (normalized.startsWith('#')) {
            const hex = normalized.slice(1);
            const expanded = hex.length === 3
                ? hex.split('').map((char) => char + char).join('')
                : hex.slice(0, 6);

            if (expanded.length === 6) {
                const r = parseInt(expanded.slice(0, 2), 16);
                const g = parseInt(expanded.slice(2, 4), 16);
                const b = parseInt(expanded.slice(4, 6), 16);
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
        }

        const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
        if (rgbMatch) {
            const channels = rgbMatch[1].split(',').map((part) => part.trim()).slice(0, 3);
            if (channels.length === 3) {
                return `rgba(${channels.join(', ')}, ${alpha})`;
            }
        }

        return color;
    }

    getThemeColors() {
        const bgPrimary = this.getCssVar('--color-bg-primary', '#1a1614');
        const bgSecondary = this.getCssVar('--color-bg-secondary', '#2a2420');
        const border = this.getCssVar('--color-border', '#4a4038');
        const textPrimary = this.getCssVar('--color-text-primary', '#e8ddd0');
        const textSecondary = this.getCssVar('--color-text-secondary', '#d0c2b9');
        const waveformLine = this.getCssVar('--waveform-line', '#7fb6ff');
        const selected = this.getCssVar('--select-option-selected', '#ffa600');
        const selectedHover = this.getCssVar('--color-accent-yellow', '#ffb347');
        const snapGuide = this.getCssVar('--marker-slice', '#ffea5e');
        const scrollbarTrack = this.getCssVar('--scrollbar-track', bgSecondary);
        const scrollbarThumb = this.getCssVar('--scrollbar-thumb', '#a35a2d');
        const scrollbarThumbHover = this.getCssVar('--scrollbar-thumb-hover', '#ffb347');

        return {
            canvasBg: bgPrimary,
            scrollbarTrack,
            scrollbarThumb,
            scrollbarThumbHover,
            scrollbarBorder: border,
            scrollbarHandle: this.withAlpha(textPrimary, 0.88),
            whiteKeyAssigned: '#f3efe9',
            blackKeyAssigned: this.withAlpha(bgPrimary, 0.92),
            whiteKeyUnassigned: this.withAlpha(textSecondary, 0.52),
            blackKeyUnassigned: this.withAlpha(border, 0.7),
            whiteKeyBorder: this.withAlpha(border, 0.9),
            blackKeyBorder: this.withAlpha(bgPrimary, 0.96),
            whiteKeyHover: '#ffffff',
            blackKeyHover: this.withAlpha(bgPrimary, 0.72),
            unassignedWhiteHover: this.withAlpha(textSecondary, 0.68),
            unassignedBlackHover: this.withAlpha(border, 0.82),
            selected,
            selectedHover,
            selectedText: bgPrimary,
            layerStroke: this.withAlpha(waveformLine, 0.82),
            velLayerBase: this.withAlpha(waveformLine, 0.56),
            velLayerSelected: this.withAlpha(selected, 0.74),
            velLayerText: textPrimary,
            dragPreview: this.withAlpha(selected, 0.34),
            snapGuide: this.withAlpha(snapGuide, 0.84),
            labelText: textSecondary
        };
    }

    resize() {
        if (!this.canvas || !this.canvas.parentElement) {
            console.warn('KeyboardVisualizer: Canvas not in DOM');
            return false;
        }

        const container = this.canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;

        this.width = container.offsetWidth;
        this.height = this.keyHeight + this.velocityPanelHeight;

        if (this.width <= 0 || this.height <= 0) {
            console.warn(`KeyboardVisualizer: Invalid dimensions (${this.width}x${this.height})`);
            return false;
        }

        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
        this.ctx.scale(dpr, dpr);

        if (this.scrollCanvas) {
            this.scrollCanvas.width = this.width * dpr;
            this.scrollCanvas.height = 30 * dpr;
            this.scrollCanvas.style.width = this.width + 'px';
            this.scrollCanvas.style.height = '30px';
            this.scrollCtx.scale(dpr, dpr);
        }

        const totalWidth = this.totalKeys * this.keyWidth;
        this.maxScroll = Math.max(0, totalWidth - this.width);

        this.render();
        return true;
    }

    calculateVelocityLayers() {
        if (!this.assetCells || this.assetCells.length === 0) return 1;

        const keyLayerCount = {};
        for (let midi = this.minKey; midi <= this.maxKey; midi++) {
            const assetsForKey = this.getAssetsForKey(midi);
            keyLayerCount[midi] = assetsForKey.length;
        }

        const maxLayers = Math.max(1, ...Object.values(keyLayerCount));
        return Math.min(16, maxLayers);
    }

    setAssets(assetCells) {
        this.assetCells = assetCells;

        const attemptRender = (retries = 0) => {
            const rendered = this.tryRenderWhenVisible();

            if (!rendered && retries < 5) {
                requestAnimationFrame(() => attemptRender(retries + 1));
            } else if (!rendered) {
                console.warn('Canvas failed to render after 5 attempts');
            }
        };

        attemptRender();
    }

    tryRenderWhenVisible() {
        if (this.canvas && this.canvas.offsetWidth > 0) {
            console.log('Canvas visible, rendering now');
            const resizeSuccess = this.resize();
            if (resizeSuccess) {
                this.render();
                if (this.assetCells.length > 0 && this.onAssetSelected) {
                    this.onAssetSelected(this.assetCells[0]);
                }
            }
            return true;
        }
        return false;
    }

    reset() {
        this.assetCells = [];
        this.selectedAsset = null;
        this.scrollPos = 0;
        this.zoom = 0.5;
        this.hoveredKey = null;

        if (this.ctx && this.width > 0 && this.height > 0) {
            this.colors = this.getThemeColors();
            this.ctx.fillStyle = this.colors.canvasBg;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        if (this.scrollCtx) {
            this.scrollCtx.fillStyle = this.colors.scrollbarTrack;
            this.scrollCtx.fillRect(0, 0, this.width, 30);
        }
    }

    render() {
        if (!this.ctx || this.width <= 0) return;

        const { ctx, width, height } = this;
        this.colors = this.getThemeColors();

        ctx.fillStyle = this.colors.canvasBg;
        ctx.fillRect(0, 0, width, height);

        const effectiveKeyWidth = this.keyWidth * this.zoom;
        const totalWidth = this.totalKeys * effectiveKeyWidth;
        this.maxScroll = Math.max(0, totalWidth - this.width);

        this.drawKeyboard();
        this.drawVelocityLayers();
        this.drawLabels();

        if (this.scrollCanvas) {
            this.renderScrollbar();
        }
    }

    drawKeyboard() {
        const { ctx, keyHeight } = this;
        const effectiveKeyWidth = this.keyWidth * this.zoom;
        const blackKeyHeight = keyHeight * 0.6;

        // WHITE KEYS
        for (let midi = this.minKey; midi <= this.maxKey; midi++) {
            if (this.isBlackKey(midi)) continue;

            const x = this.midiToX(midi);
            if (x + effectiveKeyWidth < 0 || x > this.width) continue;

            const isHovered = (this.hoveredKey === midi);
            const hasAssignment = this.getAssetsForKey(midi).length > 0;

            if (hasAssignment) {
                ctx.fillStyle = isHovered ? this.colors.whiteKeyHover : this.colors.whiteKeyAssigned;
            } else {
                ctx.fillStyle = isHovered ? this.colors.unassignedWhiteHover : this.colors.whiteKeyUnassigned;
            }
            ctx.fillRect(x, 0, effectiveKeyWidth - 1, keyHeight);

            ctx.strokeStyle = this.colors.whiteKeyBorder;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, 0, effectiveKeyWidth - 1, keyHeight);
        }

        // BLACK KEYS
        for (let midi = this.minKey; midi <= this.maxKey; midi++) {
            if (!this.isBlackKey(midi)) continue;

            const x = this.midiToX(midi);
            if (x + effectiveKeyWidth < 0 || x > this.width) continue;

            const isHovered = (this.hoveredKey === midi);
            const hasAssignment = this.getAssetsForKey(midi).length > 0;

            if (hasAssignment) {
                ctx.fillStyle = isHovered ? this.colors.blackKeyHover : this.colors.blackKeyAssigned;
            } else {
                ctx.fillStyle = isHovered ? this.colors.unassignedBlackHover : this.colors.blackKeyUnassigned;
            }
            ctx.fillRect(x, 0, effectiveKeyWidth - 1, blackKeyHeight);

            ctx.strokeStyle = this.colors.blackKeyBorder;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, 0, effectiveKeyWidth - 1, blackKeyHeight);
        }
    }

    drawVelocityLayers() {
        const { ctx, keyHeight, velocityPanelHeight } = this;
        const panelTop = keyHeight;
        const panelBottom = keyHeight + velocityPanelHeight;

        ctx.fillStyle = this.withAlpha(this.colors.scrollbarTrack, 0.32);
        ctx.fillRect(0, panelTop, this.width, velocityPanelHeight);

        [127, 96, 64, 32, 0].forEach((velocity) => {
            const y = this.velocityToY(velocity);
            ctx.strokeStyle = this.withAlpha(this.colors.layerStroke, velocity === 0 || velocity === 127 ? 0.45 : 0.22);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
            ctx.stroke();

            ctx.fillStyle = this.colors.labelText;
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`${velocity}`, this.width - 6, Math.max(panelTop + 10, y - 4));
        });

        this.assetCells.forEach((asset) => {
            const rect = this.getAssetVelocityRect(asset);
            if (!rect || rect.width <= 0 || rect.bottom <= panelTop || rect.top >= panelBottom) {
                return;
            }

            const isSelected = (this.selectedAsset === asset);
            const isDragging = (this.dragState.active && this.dragState.asset === asset);

            ctx.fillStyle = isSelected ? this.colors.velLayerSelected : this.colors.velLayerBase;
            ctx.globalAlpha = isDragging ? 0.3 : 0.88;
            ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
            ctx.globalAlpha = 1.0;

            ctx.strokeStyle = isSelected ? this.colors.selected : this.colors.layerStroke;
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

            if (rect.width > 72 && rect.height > 18) {
                const sampleName = asset.filename.split(/[/\\]/).pop().replace('.wav', '');
                const loVel = parseInt(asset.params.velrangebottom, 10) || 0;
                const hiVel = parseInt(asset.params.velrangetop, 10) || 127;
                ctx.fillStyle = isSelected ? this.colors.selectedText : this.colors.velLayerText;
                ctx.font = '10px monospace';
                ctx.textAlign = 'left';
                ctx.fillText(sampleName.substring(0, 18), rect.x + 4, rect.y + 14);
                ctx.fillText(`V ${loVel}-${hiVel}`, rect.x + 4, rect.y + Math.min(rect.height - 4, 26));
            }
        });

        // Draw drag preview
        if (this.dragState.active && this.dragState.asset) {
            this.drawDragPreview();
        }
    }

    drawDragPreview() {
        // GUARD: Only draw if drag is active
        if (!this.dragState.active || !this.dragState.asset) {
            return;
        }

        const { ctx } = this;
        const { asset, previewKeyLo, previewKeyHi, snapGuideKey } = this.dragState;
        const rect = this.getAssetVelocityRect(asset, previewKeyLo, previewKeyHi);
        if (!rect) {
            return;
        }

        const startX = this.midiToX(previewKeyLo);
        const endX = this.midiToX(previewKeyHi + 1);
        const width = endX - startX;

        ctx.fillStyle = this.colors.dragPreview;
        ctx.fillRect(startX, rect.y, width, rect.height);

        ctx.strokeStyle = this.colors.selected;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(startX, rect.y, width, rect.height);
        ctx.setLineDash([]);

        ctx.fillStyle = this.colors.selected;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        const rangeText = `${this.midiToNoteName(previewKeyLo)} - ${this.midiToNoteName(previewKeyHi)}`;
        ctx.fillText(rangeText, startX + width / 2, rect.y + Math.min(rect.height - 6, 16));

        if (snapGuideKey !== null) {
            const guideX = this.midiToX(snapGuideKey);

            ctx.strokeStyle = this.colors.snapGuide;
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(guideX, 0);
            ctx.lineTo(guideX, this.height);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = this.colors.snapGuide;
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${this.midiToNoteName(snapGuideKey)}`, guideX, this.keyHeight - 5);
        }
    }

    drawLabels() {
        const { ctx, keyWidth, keyHeight } = this;

        ctx.fillStyle = this.colors.labelText;
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';

        for (let midi = this.minKey; midi <= this.maxKey; midi++) {
            if (midi % 12 === 0) {
                const x = this.midiToX(midi);
                if (x >= 0 && x < this.width) {
                    const octave = Math.floor(midi / 12) - 1;
                    ctx.fillText(`C${octave}`, x + keyWidth / 2, this.keyHeight - 5);
                }
            }
        }
    }

    renderScrollbar() {
        if (!this.scrollCtx) return;

        const { scrollCtx, width, maxScroll, scrollPos } = this;
        const height = 30;

        scrollCtx.fillStyle = this.colors.scrollbarTrack;
        scrollCtx.fillRect(0, 0, width, height);

        const effectiveKeyWidth = this.keyWidth * this.zoom;
        const totalWidth = this.totalKeys * effectiveKeyWidth;

        const visibleKeys = width / effectiveKeyWidth;
        const visibleRatio = Math.min(1, visibleKeys / this.totalKeys);
        const thumbWidth = Math.max(40, visibleRatio * width);

        const maxThumbScroll = width - thumbWidth;
        const scrollRatio = maxScroll > 0 ? (scrollPos / maxScroll) : 0;
        const thumbX = scrollRatio * maxThumbScroll;

        scrollCtx.fillStyle = this.colors.scrollbarThumb;
        scrollCtx.fillRect(thumbX, 4, thumbWidth, height - 8);

        scrollCtx.strokeStyle = this.colors.scrollbarBorder;
        scrollCtx.lineWidth = 1;
        scrollCtx.strokeRect(thumbX + 0.5, 4.5, thumbWidth - 1, height - 9);

        scrollCtx.fillStyle = this.colors.scrollbarHandle;
        const handleWidth = 2;
        const handleHeight = 12;
        const handleY = (height - handleHeight) / 2;

        scrollCtx.fillRect(thumbX + 4, handleY, handleWidth, handleHeight);
        scrollCtx.fillRect(thumbX + thumbWidth - 4 - handleWidth, handleY, handleWidth, handleHeight);

        const centerX = thumbX + thumbWidth / 2;
        for (let i = -1; i <= 1; i++) {
            scrollCtx.fillRect(centerX + i * 4 - 1, handleY, handleWidth, handleHeight);
        }
    }

    // DRAG DETECTION
    detectHoverTarget(mouseX, mouseY) {
        if (mouseY < this.keyHeight) return null;

        for (const asset of this.assetCells) {
            const rect = this.getAssetVelocityRect(asset);
            if (!rect) continue;

            const isInsideX = mouseX >= rect.x && mouseX <= (rect.x + rect.width);
            const isInsideY = mouseY >= rect.y && mouseY <= (rect.y + rect.height);
            if (!isInsideX || !isInsideY) {
                continue;
            }
            return { type: 'body', asset };
        }

        return null;
    }

    startDrag(mouseX, mouseY, target) {
        if (!target) return;

        // SELECT THE ASSET FIRST (this was missing!)
        this.selectedAsset = target.asset;

        this.dragState.active = true;
        this.dragState.type = target.type;
        this.dragState.asset = target.asset;
        this.dragState.startX = mouseX;
        this.dragState.startY = mouseY;

        const loKey = parseInt(target.asset.params.keyrangebottom);
        const hiKey = parseInt(target.asset.params.keyrangetop);
        const rootNote = parseInt(target.asset.params.rootnote);
        const loVel = parseInt(target.asset.params.velrangebottom);
        const hiVel = parseInt(target.asset.params.velrangetop);

        this.dragState.startKeyLo = loKey;
        this.dragState.startKeyHi = hiKey;
        this.dragState.startRootNote = Number.isNaN(rootNote) ? loKey : rootNote;
        this.dragState.startVelLo = loVel;
        this.dragState.startVelHi = hiVel;
        this.dragState.currentKeyLo = loKey;
        this.dragState.currentKeyHi = hiKey;
        this.dragState.currentVelLo = loVel;
        this.dragState.currentVelHi = hiVel;
        this.dragState.previewKeyLo = loKey;
        this.dragState.previewKeyHi = hiKey;
        this.dragState.previewVelLo = loVel;
        this.dragState.previewVelHi = hiVel;

        console.log(`Started drag: ${this.dragState.type}`, {
            keys: `${loKey}-${hiKey}`
        });
    }

    updateDrag(mouseX, mouseY = this.dragState.startY) {
        if (!this.dragState.active) return;

        const { type, asset, startX, startY, startKeyLo, startKeyHi, startRootNote, startVelLo, startVelHi } = this.dragState;
        const currentMidi = this.xToMidi(mouseX);
        const deltaMidi = currentMidi - this.xToMidi(startX);
        const deltaY = mouseY - startY;

        let newKeyLo = startKeyLo;
        let newKeyHi = startKeyHi;
        let newVelLo = startVelLo;
        let newVelHi = startVelHi;

        if (type === 'body') {
            const zoneWidth = startKeyHi - startKeyLo;
            newKeyLo = Math.max(0, Math.min(127 - zoneWidth, startKeyLo + deltaMidi));
            newKeyHi = Math.min(127, newKeyLo + zoneWidth); // CLAMP to 127

            const velWidth = startVelHi - startVelLo;
            const velocityDelta = Math.round((-deltaY / this.velocityPanelHeight) * 127);
            newVelLo = Math.max(0, Math.min(127 - velWidth, startVelLo + velocityDelta));
            newVelHi = Math.min(127, newVelLo + velWidth);
        }

        // CLAMP all values to 0-127 before storing
        newKeyLo = Math.max(0, Math.min(127, newKeyLo));
        newKeyHi = Math.max(0, Math.min(127, newKeyHi));
        newVelLo = Math.max(0, Math.min(127, newVelLo));
        newVelHi = Math.max(newVelLo, Math.min(127, newVelHi));
        
        this.dragState.currentKeyLo = newKeyLo;
        this.dragState.currentKeyHi = newKeyHi;
        this.dragState.currentVelLo = newVelLo;
        this.dragState.currentVelHi = newVelHi;
        this.dragState.previewKeyLo = newKeyLo;
        this.dragState.previewKeyHi = newKeyHi;
        this.dragState.previewVelLo = newVelLo;
        this.dragState.previewVelHi = newVelHi;
        this.dragState.snapGuideKey = null;
        
        asset.params.keyrangebottom = newKeyLo.toString();
        asset.params.keyrangetop = newKeyHi.toString();
        asset.params.velrangebottom = newVelLo.toString();
        asset.params.velrangetop = newVelHi.toString();
        if (type === 'body') {
            const shiftedRoot = Math.max(0, Math.min(127, startRootNote + deltaMidi));
            asset.params.rootnote = shiftedRoot.toString();
        }
        
        this.syncDropdownsFromAsset(asset);
        
        this.render();
    }

    endDrag() {
        if (!this.dragState.active) return;

        // Set flag to prevent click handler from firing
        this._justFinishedDrag = true;

        // SAVE REFERENCES BEFORE CLEARING STATE
        const draggedAsset = this.dragState.asset;

        // CLAMP to valid MIDI range before saving
        let finalKeyLo = Math.max(0, Math.min(127, this.dragState.currentKeyLo));
        let finalKeyHi = Math.max(0, Math.min(127, this.dragState.currentKeyHi));
        let finalVelLo = Math.max(0, Math.min(127, this.dragState.currentVelLo));
        let finalVelHi = Math.max(0, Math.min(127, this.dragState.currentVelHi));
    
        // Ensure keyHi >= keyLo
        if (finalKeyHi < finalKeyLo) {
            finalKeyHi = finalKeyLo;
        }
        if (finalVelHi < finalVelLo) {
            finalVelHi = finalVelLo;
        }

        console.log(`Ended drag: ${this.dragState.type}`, {
            finalKeys: `${finalKeyLo}-${finalKeyHi}`
        });

        // Final update with CLAMPED values
        if (draggedAsset) {
            draggedAsset.params.keyrangebottom = finalKeyLo.toString();
            draggedAsset.params.keyrangetop = finalKeyHi.toString();
            draggedAsset.params.velrangebottom = finalVelLo.toString();
            draggedAsset.params.velrangetop = finalVelHi.toString();
            if (this.dragState.type === 'body') {
                const startRoot = parseInt(draggedAsset.params.rootnote, 10);
                const rootFromCurrent = Number.isNaN(startRoot)
                    ? finalKeyLo
                    : Math.max(0, Math.min(127, startRoot));
                draggedAsset.params.rootnote = rootFromCurrent.toString();
            }
        }

        // Reset drag state
        this.dragState = {
            active: false,
            type: null,
            asset: null,
            startX: 0,
            startY: 0,
            startKeyLo: 0,
            startKeyHi: 0,
            startRootNote: 0,
            startVelLo: 0,
            startVelHi: 0,
            currentKeyLo: 0,
            currentKeyHi: 0,
            currentVelLo: 0,
            currentVelHi: 0,
            previewKeyLo: 0,
            previewKeyHi: 0,
            previewVelLo: 0,
            previewVelHi: 0,
            neighborLeft: null,
            neighborRight: null,
            snapGuideKey: null
        };

        this.render();
    }

    syncDropdownsFromAsset(asset) {
        if (window._multiKeyboardViz && window._multiKeyboardViz.selectedAsset === asset) {
        const rootNote = parseInt(asset.params.rootnote);
        const loKey = parseInt(asset.params.keyrangebottom);
        const hiKey = parseInt(asset.params.keyrangetop);
        
        const rootNoteDropdown = document.getElementById('multiRootNote');
        const keyLoDropdown = document.getElementById('multiKeyLo');
        const keyHiDropdown = document.getElementById('multiKeyHi');
        const velLoDropdown = document.getElementById('multiVelLo');
        const velHiDropdown = document.getElementById('multiVelHi');
        
        if (rootNoteDropdown) rootNoteDropdown.value = rootNote.toString();
        if (keyLoDropdown) keyLoDropdown.value = loKey.toString();
        if (keyHiDropdown) keyHiDropdown.value = hiKey.toString();
        if (velLoDropdown) velLoDropdown.value = asset.params.velrangebottom;
        if (velHiDropdown) velHiDropdown.value = asset.params.velrangetop;
        } else {
            console.log('❌ Condition failed - dropdowns NOT updated');
        }
    }


    velocityToY(velocity) {
        const clamped = Math.max(0, Math.min(127, parseInt(velocity, 10) || 0));
        const ratio = (127 - clamped) / 127;
        return this.keyHeight + (ratio * this.velocityPanelHeight);
    }

    getAssetVelocityRect(asset, overrideLo = null, overrideHi = null) {
        if (!asset?.params) {
            return null;
        }

        const loKey = Math.max(0, Math.min(127, overrideLo ?? (parseInt(asset.params.keyrangebottom, 10) || 0)));
        const hiKey = Math.max(loKey, Math.min(127, overrideHi ?? (parseInt(asset.params.keyrangetop, 10) || loKey)));
        const loVel = Math.max(0, Math.min(127, parseInt(asset.params.velrangebottom, 10) || 0));
        const hiVel = Math.max(loVel, Math.min(127, parseInt(asset.params.velrangetop, 10) || loVel));

        const x = this.midiToX(loKey);
        const right = this.midiToX(hiKey + 1);
        const top = this.velocityToY(hiVel);
        const bottom = this.velocityToY(loVel);
        const width = right - x;
        const height = Math.max(8, bottom - top + 4);

        return {
            x,
            y: top,
            width,
            height,
            top,
            bottom: top + height
        };
    }

    setupEventListeners() {
        // Mouse down - start drag
        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
                
            const target = this.detectHoverTarget(x, y);
            if (target) {
                // Store potential drag target, but don't start drag yet
                this._pendingDrag = {
                    target: target,
                    startX: x,
                    startY: y,
                    mouseDownTime: Date.now()
                };
                e.preventDefault();
            }
        });

        // Mouse move - update drag or cursor
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Check if we should start a drag from pending mousedown
            if (this._pendingDrag && !this.dragState.active) {
                const dx = x - this._pendingDrag.startX;
                const dy = y - this._pendingDrag.startY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Only start drag if mouse moved more than 3 pixels
                if (distance > 3) {
                    this.startDrag(this._pendingDrag.startX, this._pendingDrag.startY, this._pendingDrag.target);
                    this._pendingDrag = null;
                }
            }
        
            if (this.dragState.active) {
                this.updateDrag(x, y);
            } else {
                const target = this.detectHoverTarget(x, y);
                if (target) {
                    if (target.type === 'body') {
                        this.canvas.style.cursor = 'move';
                    }
                } else {
                    this.canvas.style.cursor = 'default';
                }
            
                // Hover effect - DEBOUNCED to prevent flicker
                if (y < this.keyHeight) {
                    const midi = this.xToMidi(x);
                    if (midi !== this.hoveredKey) {
                        this.hoveredKey = midi;
                        // Don't render immediately - schedule for next frame
                        if (!this.renderScheduled) {
                            this.renderScheduled = true;
                            requestAnimationFrame(() => {
                                this.render();
                                this.renderScheduled = false;
                            });
                        }
                    }
                } else {
                    if (this.hoveredKey !== null) {
                        this.hoveredKey = null;
                        // Don't render immediately - schedule for next frame
                        if (!this.renderScheduled) {
                            this.renderScheduled = true;
                            requestAnimationFrame(() => {
                                this.render();
                                this.renderScheduled = false;
                            });
                        }
                    }
                }
            }
        });

        // Mouse up - end drag
        this.canvas.addEventListener('mouseup', () => {
            if (this.dragState.active) {
                this.endDrag();
            }
            // Clear pending drag if it never started
            this._pendingDrag = null;
        });

        // Mouse leave - cancel drag
        this.canvas.addEventListener('mouseleave', () => {
            if (this.dragState.active) {
                this.endDrag();
            }
            this.canvas.style.cursor = 'default';
        });

        // Mouse click - select asset
        this.canvas.addEventListener('click', (e) => {
            if (this.dragState.active) return;
        
            // Don't process click after drag
            if (this._justFinishedDrag) {
                this._justFinishedDrag = false;
                return;
            }
        
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Check if clicking on velocity layer zones first (below keyboard)
            if (y >= this.keyHeight) {
                const target = this.detectHoverTarget(x, y);
                if (target && target.asset) {
                    this.selectAsset(target.asset);
                    return; // Exit early - we found the zone
                }
            }
            
            // If not clicking zone, check keyboard keys
            if (y < this.keyHeight) {
                const midi = this.xToMidi(x);
                if (midi >= this.minKey && midi <= this.maxKey) {
                    const assets = this.getAssetsForKey(midi);
                    if (assets.length > 0) {
                        this.selectAsset(assets[0]);
                    } else if (this.onEmptyKeySelected) {
                        this.onEmptyKeySelected(midi);
                    }
                }
            }
        });


        // Flag to prevent render flicker
        this.renderScheduled = false;

        // Scroll handling
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY;
            this.scrollPos = Math.max(0, Math.min(this.maxScroll, this.scrollPos + delta));
            this.render();
        });

        // SCROLL-ZOOM BAR INTERACTION
        if (this.scrollCanvas) {
            let draggingMode = null;
            let startX = 0;
            let startScroll = 0;
            let startZoom = 1;

            this.scrollCanvas.addEventListener('mousedown', (e) => {
                const rect = this.scrollCanvas.getBoundingClientRect();
                const x = e.clientX - rect.left;

                const effectiveKeyWidth = this.keyWidth * this.zoom;
                const visibleKeys = this.width / effectiveKeyWidth;
                const visibleRatio = Math.min(1, visibleKeys / this.totalKeys);
                const thumbWidth = Math.max(40, visibleRatio * this.width);
                const maxThumbScroll = this.width - thumbWidth;
                const scrollRatio = this.maxScroll > 0 ? (this.scrollPos / this.maxScroll) : 0;
                const thumbX = scrollRatio * maxThumbScroll;

                const edgeThreshold = 8;

                if (x >= thumbX && x <= thumbX + edgeThreshold) {
                    draggingMode = 'left-edge';
                    this.scrollCanvas.style.cursor = 'ew-resize';
                } else if (x >= thumbX + thumbWidth - edgeThreshold && x <= thumbX + thumbWidth) {
                    draggingMode = 'right-edge';
                    this.scrollCanvas.style.cursor = 'ew-resize';
                } else if (x > thumbX + edgeThreshold && x < thumbX + thumbWidth - edgeThreshold) {
                    draggingMode = 'body';
                    this.scrollCanvas.style.cursor = 'grabbing';
                }

                startX = x;
                startScroll = this.scrollPos;
                startZoom = this.zoom;
            });

            this.scrollCanvas.addEventListener('mousemove', (e) => {
                if (!draggingMode) {
                    const rect = this.scrollCanvas.getBoundingClientRect();
                    const x = e.clientX - rect.left;

                    const effectiveKeyWidth = this.keyWidth * this.zoom;
                    const visibleKeys = this.width / effectiveKeyWidth;
                    const visibleRatio = Math.min(1, visibleKeys / this.totalKeys);
                    const thumbWidth = Math.max(40, visibleRatio * this.width);
                    const maxThumbScroll = this.width - thumbWidth;
                    const scrollRatio = this.maxScroll > 0 ? (this.scrollPos / this.maxScroll) : 0;
                    const thumbX = scrollRatio * maxThumbScroll;

                    const edgeThreshold = 8;

                    if ((x >= thumbX && x <= thumbX + edgeThreshold) ||
                        (x >= thumbX + thumbWidth - edgeThreshold && x <= thumbX + thumbWidth)) {
                        this.scrollCanvas.style.cursor = 'ew-resize';
                    } else if (x > thumbX + edgeThreshold && x < thumbX + thumbWidth - edgeThreshold) {
                        this.scrollCanvas.style.cursor = 'grab';
                    } else {
                        this.scrollCanvas.style.cursor = 'default';
                    }
                    return;
                }

                const rect = this.scrollCanvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const deltaX = x - startX;

                if (draggingMode === 'body') {
                    const effectiveKeyWidth = this.keyWidth * this.zoom;
                    const scrollDelta = (deltaX / this.width) * this.totalKeys * effectiveKeyWidth;
                    this.scrollPos = Math.max(0, Math.min(this.maxScroll, startScroll + scrollDelta));
                } else if (draggingMode === 'left-edge') {
                    const zoomSensitivity = 0.01;
                    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, startZoom * (1 + deltaX * zoomSensitivity)));
                    this.zoom = newZoom;
                    this.maxScroll = Math.max(0, (this.totalKeys * this.keyWidth * this.zoom) - this.width);
                } else if (draggingMode === 'right-edge') {
                    const zoomSensitivity = 0.01;
                    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, startZoom * (1 - deltaX * zoomSensitivity)));
                    this.zoom = newZoom;
                    this.maxScroll = Math.max(0, (this.totalKeys * this.keyWidth * this.zoom) - this.width);
                }

                this.render();
            });

            this.scrollCanvas.addEventListener('mouseup', () => {
                if (draggingMode) {
                    draggingMode = null;
                    this.scrollCanvas.style.cursor = 'default';
                }
            });

            this.scrollCanvas.addEventListener('mouseleave', () => {
                if (draggingMode) {
                    draggingMode = null;
                    this.scrollCanvas.style.cursor = 'default';
                }
            });
        }

        // Window resize
        window.addEventListener('resize', () => this.resize());
    }

    selectAsset(asset) {
        console.log('*** KeyboardVisualizer.selectAsset() CALLED ***');
        console.log('*** Asset filename:', asset.filename);
        console.log('*** Asset keyrangebottom:', asset.params.keyrangebottom);
        console.log('*** Asset keyrangetop:', asset.params.keyrangetop);
    
        this.selectedAsset = asset;
        
        // Sync dropdowns immediately when selecting new asset
        this.syncDropdownsFromAsset(asset);
        
        this.render();

        if (this.onAssetSelected) {
            console.log('*** Calling onAssetSelected callback ***');
            this.onAssetSelected(asset);
        }
    }

    midiToX(midi) {
        const effectiveKeyWidth = this.keyWidth * this.zoom;
        return ((midi - this.minKey) * effectiveKeyWidth) - this.scrollPos;
    }

    xToMidi(x) {
        const effectiveKeyWidth = this.keyWidth * this.zoom;
        return Math.floor((x + this.scrollPos) / effectiveKeyWidth) + this.minKey;
    }

    isBlackKey(midi) {
        const note = midi % 12;
        return [1, 3, 6, 8, 10].includes(note);
    }

    midiToNoteName(midi) {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midi / 12) - 1;
        const note = notes[midi % 12];
        return `${note}${octave}`;
    }

    getAssetsForKey(midi) {
        return this.assetCells.filter(asset => {
            const loKey = parseInt(asset.params.keyrangebottom);
            const hiKey = parseInt(asset.params.keyrangetop);
            return midi >= loKey && midi <= hiKey;
        });
    }

    getAssetsForKeyAndVelLayer(midi, layer) {
        const velRanges = [
            [0, 42],
            [43, 84],
            [85, 127]
        ];

        return this.assetCells.filter(asset => {
            const loKey = parseInt(asset.params.keyrangebottom);
            const hiKey = parseInt(asset.params.keyrangetop);
            const loVel = parseInt(asset.params.velrangebottom);
            const hiVel = parseInt(asset.params.velrangetop);

            const [layerLoVel, layerHiVel] = velRanges[layer];

            return (midi >= loKey && midi <= hiKey) &&
                (loVel <= layerHiVel && hiVel >= layerLoVel);
        });
    }

    getVelLayerColor(layer) {
        return [this.colors.velLayer1, this.colors.velLayer2, this.colors.velLayer3][layer];
    }
}
window.KeyboardVisualizer = KeyboardVisualizer;
