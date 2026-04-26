/**
 * BITBOXER - Pad Editor
 * 
 * This file handles pad editing functionality:
 * - Opening/closing pad edit modal
 * - Loading/saving pad parameters
 * - Parameter event listeners
 * - Modulation slot management
 * - Envelope visualization
 */

/**
 * BITBOXER - Unified Multisample State Manager
 * Tracks current asset, audio buffer, and loop points in one place
 */
class MultisampleEditorState {
    constructor() {
        this.reset();
    }

    reset() {
        this.currentAsset = null;
        this.audioBuffer = null;
        this.hasLoadedAudio = false;
        this.loopStart = 0;
        this.loopEnd = 0;
        this.loopEnabled = false;
    }

    setAsset(asset) {
        this.currentAsset = asset;
        this.hasLoadedAudio = false;
    }

    setAudioData(audioBuffer, loopStart, loopEnd, loopEnabled) {
        this.audioBuffer = audioBuffer;
        this.loopStart = loopStart;
        this.loopEnd = loopEnd;
        this.loopEnabled = loopEnabled;
        this.hasLoadedAudio = true;
    }

    clearAudioOnly() {
        this.audioBuffer = null;
        this.hasLoadedAudio = false;
    }

    needsReload(asset) {
        return !this.hasLoadedAudio || 
               this.currentAsset !== asset ||
               !this.audioBuffer;
    }
}

// Initialize global state
window._multiEditorState = new MultisampleEditorState();


// ============================================
// PAD EDIT MODAL
// ============================================
/**
 * Opens the pad edit modal for a specific pad
 * 
 * @param {HTMLElement} pad - Pad element to edit
 */
async function openEditModal(pad) {
    const { presetData } = window.BitboxerData;
    const row = parseInt(pad.dataset.row);
    const col = parseInt(pad.dataset.col);
    const padData = presetData.pads[row][col];

    if (!padData) return;

    window.BitboxerData.currentEditingPad = pad;

    

    // Clear editors
    if (window.BitboxerSampleEditor) {
        window.BitboxerSampleEditor.clearAudioData();
    }
    
    if (window._multiSampleEditor) {
        window._multiSampleEditor.clearAudioData();
    }

    if (window._multiEditorState) {
        window._multiEditorState.reset();
    }
    
    // Clear multisample visualizer state without recreating listeners on the same canvas
    if (window._multiKeyboardViz) {
        window._multiKeyboardViz.reset();
    }
    
    // Hide multisample UI
    const editPanel = document.getElementById('multiEditPanel');
    if (editPanel) editPanel.style.display = 'none';

    updateModalIcon(padData);
    document.getElementById('modalTitle').textContent =
        `Pad ${pad.dataset.padnum} - ${padData.filename || 'Empty'}`;

    loadParamsToModal(padData);
    renderModSlots(padData);
    updateSliderMaxValues(padData);
    await initSampleEditor(padData);

    window.BitboxerUI.openModal('editModal');

    window.BitboxerUI.updateTabVisibility();
    window.BitboxerUI.updateLFOParameterVisibility();
    window.BitboxerUI.updatePosConditionalVisibility();

    // Force browser reflow to ensure CSS changes take effect
    document.getElementById('tab-multi').offsetHeight;


    // Reset to Main tab
    const editModal = document.getElementById('editModal');
    const tabBtns = editModal.querySelectorAll('.tab-btn');
    const tabContents = editModal.querySelectorAll('.tab-content');

    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    tabBtns[0].classList.add('active');
    tabContents[0].classList.add('active');

    drawEnvelope();

    // Sample editor resize
    setTimeout(() => {
        if (window.BitboxerSampleEditor.renderer) {
            window.BitboxerSampleEditor.renderer.resize();
            window.BitboxerSampleEditor.render();
        }
        if (window.BitboxerSampleEditor.scrollZoomBar) {
            window.BitboxerSampleEditor.scrollZoomBar.resize();
        }
    }, 50);
}

/**
 * Loads pad parameters into modal UI elements
 * 
 * @param {Object} padData - Pad data object
 */
function loadParamsToModal(padData) {
    const params = padData.params;

    // Load slider parameters
    const sliderParams = [
        'gaindb', 'pitch', 'panpos', 'dualfilcutoff', 'res',
        'envattack', 'envdecay', 'envsus', 'envrel',
        'lforate', 'lfoamount',
        'samstart', 'samlen', 'loopstart', 'loopend', 'loopfadeamt',
        'actslice', 'grainsizeperc', 'grainscat', 'grainpanrnd',
        'graindensity', 'grainreadspeed', 'gainssrcwin',
        'rootnote', 'fx1send', 'fx2send', 'beatcount'
    ];

    sliderParams.forEach(param => {
        const slider = document.getElementById(param);
        if (slider && params[param] !== undefined) {
            slider.value = params[param];
            window.BitboxerUtils.updateParamDisplay(param, params[param]);
        }
    });

    // Load dropdown parameters
    const dropdownParams = [
        'loopmodes', 'loopmode', 'samtrigtype', 'polymode',
        'lfowave', 'lfokeytrig', 'lfobeatsync', 'lforatebeatsync',
        'midimode', 'reverse', 'outputbus', 'chokegrp', 'slicestepmode',
        'legatomode', 'interpqual', 'quantsize', 'synctype', 'playthru',
        'slicerquantsize', 'slicersync'
    ];

    // Load cellmode dropdown - check for multisample
    const cellmodeSelect = document.getElementById('cellmode');
    if (cellmodeSelect && params.cellmode !== undefined) {
        const isMultisample = params.multisammode === '1';
        cellmodeSelect.value = isMultisample ? '0-multi' : params.cellmode;

        // Trigger visibility update immediately
        window.BitboxerUI.updateTabVisibility();
    }

    dropdownParams.forEach(param => {
        const select = document.getElementById(param);
        if (select && params[param] !== undefined) {
            select.value = params[param];
        }
    });
}

/**
 * Updates slider max values based on sample length
 * 
 * @param {Object} padData - Pad data object
 */
function updateSliderMaxValues(padData) {
    // CRITICAL FIX: Get actual audio buffer length, not samlen param
    let actualSampleLength = 4294967295; // Default fallback
    
    // Try to get actual sample length from loaded audio
    if (window.BitboxerSampleEditor && 
        window.BitboxerSampleEditor.audioEngine && 
        window.BitboxerSampleEditor.audioEngine.audioBuffer) {
        actualSampleLength = window.BitboxerSampleEditor.audioEngine.audioBuffer.length;
        console.log(`Using actual audio buffer length: ${actualSampleLength}`);
    } else {
        console.log(`No audio buffer available, using default max: ${actualSampleLength}`);
    }
    
    // Update position sliders - ALL use actual sample length as max
    ['samstart', 'samlen', 'loopstart', 'loopend'].forEach(param => {
        const slider = document.getElementById(param);
        if (slider) {
            slider.max = actualSampleLength;
            console.log(`Set ${param} max to ${actualSampleLength}`);
        }
    });
}

// ============================================
// PARAMETER EVENT LISTENERS
// ============================================
/**
 * Sets up all parameter event listeners for sliders and dropdowns
 */
function setupParameterListeners() {
    // Slider parameters
    const sliderParams = [
        'gaindb', 'pitch', 'panpos', 'dualfilcutoff', 'res',
        'envattack', 'envdecay', 'envsus', 'envrel',
        'lforate', 'lfoamount',
        'samstart', 'samlen', 'loopstart', 'loopend', 'loopfadeamt',
        'actslice', 'grainsizeperc', 'grainscat', 'grainpanrnd',
        'graindensity', 'grainreadspeed', 'gainssrcwin',
        'rootnote', 'fx1send', 'fx2send', 'beatcount'
    ];

    sliderParams.forEach(param => {
        const slider = document.getElementById(param);
        const display = document.getElementById(param + '-val');
        
        if (slider && display) {
            // Slider input event
            slider.addEventListener('input', () => {
                updateParamAndSave(param, slider.value);
                if (param.startsWith('env')) drawEnvelope();
                
                // Update sample editor canvas for position/loop parameters
                // ONLY when user manually moves slider (not during marker drag)
                if (['samstart', 'samlen', 'loopstart', 'loopend'].includes(param)) {
                    if (window.BitboxerSampleEditor && 
                        window.BitboxerSampleEditor.markerController &&
                        !window.BitboxerSampleEditor.markerController.isUpdatingFromDrag) {
                        
                        const { currentEditingPad, presetData } = window.BitboxerData;
                        if (currentEditingPad) {
                            const row = parseInt(currentEditingPad.dataset.row);
                            const col = parseInt(currentEditingPad.dataset.col);
                            const pad = presetData.pads[row][col];
                            
                            // Sync markers from pad params
                            window.BitboxerSampleEditor.markerController.syncFromPadParams(pad);
                            
                            // Re-render canvas
                            window.BitboxerSampleEditor.render();
                        }
                    }
                }
            });
        
            // Make display editable
            setupEditableDisplay(display, slider, param);
        }
    });



    // Granular parameter listeners (update visualization)
    ['grainsizeperc', 'gainssrcwin'].forEach(param => {
        const slider = document.getElementById(param);
        if (slider) {
            slider.addEventListener('input', () => {
                window.BitboxerSampleEditor.updateGranularParams();
            });
        }
    });

    // Clip mode parameter listeners
    const beatcountSlider = document.getElementById('beatcount');
    if (beatcountSlider) {
        beatcountSlider.addEventListener('input', () => {
            window.BitboxerSampleEditor.updateGranularParams(); // Reuses same update mechanism
        });
    }

    // Dropdown parameters
    const dropdownParams = [
        'cellmode', 'loopmodes', 'loopmode', 'samtrigtype', 'polymode',
        'lfowave', 'lfokeytrig', 'lfobeatsync', 'lforatebeatsync',
        'midimode', 'reverse', 'outputbus', 'chokegrp', 'slicestepmode',
        'legatomode', 'interpqual', 'quantsize', 'synctype', 'playthru',
        'slicerquantsize', 'slicersync'
    ];

    dropdownParams.forEach(param => {
        const select = document.getElementById(param);
        if (select) {
            select.addEventListener('change', () => {
                const value = select.value;

                // Handle multisample special case
                if (param === 'cellmode') {
                    if (value === '0-multi') {
                        updateParamAndSave('cellmode', '0');
                        updateParamAndSave('multisammode', '1');
                    } else {
                        const { currentEditingPad, presetData } = window.BitboxerData;
                        const row = parseInt(currentEditingPad?.dataset.row, 10);
                        const col = parseInt(currentEditingPad?.dataset.col, 10);
                        const padData = presetData?.pads?.[row]?.[col];
                        const wasMultisample = padData?.params?.multisammode === '1';
                        const existingLayerCount = wasMultisample && !Number.isNaN(row) && !Number.isNaN(col)
                            ? countMultisampleAssetsForPad(row, col)
                            : 0;

                        if (wasMultisample && existingLayerCount > 1) {
                            const confirmed = confirm(
                                `This pad contains ${existingLayerCount} multisample layers. Switching mode will remove them. Continue?`
                            );
                            if (!confirmed) {
                                select.value = '0-multi';
                                return;
                            }
                        }

                        updateParamAndSave('cellmode', value);
                        updateParamAndSave('multisammode', '0');

                        if (wasMultisample && !Number.isNaN(row) && !Number.isNaN(col)) {
                            const removedCount = purgeMultisampleAssetsForPad(row, col);
                            if (removedCount > 0) {
                                window.BitboxerUtils.setStatus(`Removed ${removedCount} multisample layer${removedCount > 1 ? 's' : ''}`, 'info');
                            }
                        }
                    }

                    // Update visibility based on changes
                    window.BitboxerUI.updateTabVisibility();
                    window.BitboxerUI.updatePosConditionalVisibility();
                    if (value === '0-multi') {
                        requestAnimationFrame(() => {
                            renderMultisampleList();
                            if (window._multiKeyboardViz) {
                                window._multiKeyboardViz.resize();
                                window._multiKeyboardViz.render();
                            }
                        });
                    }

                    // Force browser to recalculate styles
                    document.getElementById('tab-pos').offsetHeight;

                    // Refresh mod destinations when cell mode changes
                    const { currentEditingPad, presetData } = window.BitboxerData;
                    if (currentEditingPad) {
                        const row = parseInt(currentEditingPad.dataset.row);
                        const col = parseInt(currentEditingPad.dataset.col);
                        renderModSlots(presetData.pads[row][col]);

                        // Update modal icon
                        updateModalIcon(presetData.pads[row][col]);

                        // Re-init sample editor with new mode
                        const padData = presetData.pads[row][col];
                        initSampleEditor(padData);
                    }

                    // Refresh sample editor canvas with new mode
                    if (window.BitboxerSampleEditor) {
                        const modeValue = value === '0-multi' ? '0' : value;
                        window.BitboxerSampleEditor.setMode(modeValue);
                        window.BitboxerSampleEditor.render();
                    }
                } else {
                    // For all other dropdowns, just save the value
                    updateParamAndSave(param, value);
                }

                // Update visibility for other specific parameters
                if (param === 'lfobeatsync') {
                    window.BitboxerUI.updateLFOParameterVisibility();
                }

                if (param === 'loopmodes') {
                    window.BitboxerUI.updatePosConditionalVisibility();
                }
            });
        }
    });
}

/**
 * Sets up an editable display for a parameter
 * Allows clicking on the value to edit it directly
 * 
 * @param {HTMLElement} display - Display element
 * @param {HTMLInputElement} slider - Associated slider
 * @param {string} param - Parameter name
 */
function setupEditableDisplay(display, slider, param) {
    display.style.cursor = 'text';
    display.contentEditable = true;
    
    // Handle blur (when user clicks away)
    display.addEventListener('blur', () => {
        const value = window.BitboxerUtils.parseDisplayValue(param, display.textContent);
        if (value !== null) {
            slider.value = value;
            window.BitboxerUtils.updateParamDisplay(param, value);
            updateParamAndSave(param, value);
            if (param.startsWith('env')) drawEnvelope();
        }
    });
    
    // Handle Enter key
    display.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            display.blur();
        }
    });
    
    // Mouse wheel support (non-passive to allow preventDefault)
    display.addEventListener('wheel', (e) => {
        e.preventDefault();
        const currentVal = parseInt(slider.value);
        const step = e.shiftKey ? 100 : 10;
        const newVal = currentVal + (e.deltaY < 0 ? step : -step);
        const clampedVal = Math.max(
            parseInt(slider.min),
            Math.min(parseInt(slider.max), newVal)
        );

        slider.value = clampedVal;
        window.BitboxerUtils.updateParamDisplay(param, clampedVal);
        updateParamAndSave(param, clampedVal);
        if (param.startsWith('env')) drawEnvelope();
    }, { passive: false });

    // Touch support for mobile
    let touchStartY = 0;
    let touchStartValue = 0;

    display.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        touchStartValue = parseInt(slider.value);
        e.preventDefault();
    }, { passive: false });

    display.addEventListener('touchmove', (e) => {
        const touchY = e.touches[0].clientY;
        const deltaY = touchStartY - touchY;
        const sensitivity = 2;
        const step = Math.floor(deltaY / sensitivity);

        const newVal = touchStartValue + step * 10;
        const clampedVal = Math.max(
            parseInt(slider.min),
            Math.min(parseInt(slider.max), newVal)
        );

        slider.value = clampedVal;
        window.BitboxerUtils.updateParamDisplay(param, clampedVal);
        updateParamAndSave(param, clampedVal);
        if (param.startsWith('env')) drawEnvelope();

        e.preventDefault();
    }, { passive: false });
}

/**
 * Updates a parameter value and saves it to the pad data
 * 
 * @param {string} param - Parameter name
 * @param {string|number} value - New value
 */
function updateParamAndSave(param, value) {
    const { currentEditingPad, presetData } = window.BitboxerData;
    
    if (currentEditingPad && presetData) {
        const row = parseInt(currentEditingPad.dataset.row);
        const col = parseInt(currentEditingPad.dataset.col);
        presetData.pads[row][col].params[param] = value.toString();
    }
    
    window.BitboxerUtils.updateParamDisplay(param, value);
}

function purgeMultisampleAssetsForPad(row, col) {
    const { assetCells } = window.BitboxerData;
    if (!Array.isArray(assetCells) || assetCells.length === 0) {
        return 0;
    }

    const beforeCount = assetCells.length;
    window.BitboxerData.assetCells = assetCells.filter((asset) =>
        !(parseInt(asset.params?.asssrcrow, 10) === row &&
          parseInt(asset.params?.asssrccol, 10) === col)
    );

    const removedCount = beforeCount - window.BitboxerData.assetCells.length;

    if (removedCount > 0 && window._multiKeyboardViz) {
        window._multiKeyboardViz.reset();
    }

    return removedCount;
}

function countMultisampleAssetsForPad(row, col) {
    const { assetCells } = window.BitboxerData;
    if (!Array.isArray(assetCells) || assetCells.length === 0) {
        return 0;
    }

    return assetCells.filter((asset) =>
        parseInt(asset.params?.asssrcrow, 10) === row &&
        parseInt(asset.params?.asssrccol, 10) === col
    ).length;
}

// ============================================
// ENVELOPE VISUALIZATION
// ============================================
/**
 * Draws the ADSR envelope visualization on canvas
 */
function drawEnvelope() {
    const canvas = document.getElementById('envelopeCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    ctx.clearRect(0, 0, width, height);

    // Get envelope values
    const attack = parseFloat(document.getElementById('envattack').value) / 1000;
    const decay = parseFloat(document.getElementById('envdecay').value) / 1000;
    const sustain = parseFloat(document.getElementById('envsus').value) / 100;
    const release = parseFloat(document.getElementById('envrel').value) / 1000;

    const totalTime = attack + decay + release + 1; // +1 for sustain visualization
    const scale = width / totalTime;

    // Grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
        const y = i * height / 4;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Envelope
    ctx.strokeStyle = '#FF6B35';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(attack * scale, 0);
    ctx.lineTo((attack + decay) * scale, height * (1 - sustain));
    ctx.lineTo((attack + decay + 1) * scale, height * (1 - sustain));
    ctx.lineTo(width, height);
    ctx.stroke();
}

// ============================================
// MODULATION SLOT RENDERING
// ============================================
function renderModSlots(padData) {
    const container = document.getElementById('modSlotsContainer');
    if (!container) return;

    container.innerHTML = '';

    if (!Array.isArray(padData.modsources)) {
        padData.modsources = [];
    }

    padData.modsources.forEach((mod, index) => {
        container.appendChild(createModSlotElement(padData, mod, index));
    });
}

function createModSlotElement(padData, mod, index) {
    const slot = document.createElement('div');
    slot.className = 'mod-slot';
    slot.innerHTML = `
        <select class="select mod-src" data-index="${index}"></select>
        <span>→</span>
        <select class="select mod-dest" data-index="${index}"></select>
        <input type="range" class="slider mod-amount" min="-1000" max="1000" step="1" value="${mod.amount || 0}" data-index="${index}">
        <span class="mod-amount-val">${mod.amount || 0}</span>
        <button class="btn btn-small mod-remove" data-index="${index}">×</button>
    `;

    updateModSlotAppearance(slot, padData, mod, index);

    const srcSelect = slot.querySelector('.mod-src');
    const destSelect = slot.querySelector('.mod-dest');
    const amountSlider = slot.querySelector('.mod-amount');
    const amountVal = slot.querySelector('.mod-amount-val');
    const removeBtn = slot.querySelector('.mod-remove');

    srcSelect.onchange = () => {
        padData.modsources[index].src = srcSelect.value;
        renderModSlots(padData);
    };
    destSelect.onchange = () => {
        padData.modsources[index].dest = destSelect.value;
    };
    amountSlider.oninput = () => {
        padData.modsources[index].amount = amountSlider.value;
        amountVal.textContent = amountSlider.value;
    };
    removeBtn.onclick = () => removeModSlot(index);

    return slot;
}

function updateModSlotAppearance(slot, padData, mod, index) {
    const { MOD_SOURCES, MOD_DESTINATIONS } = window.BITBOXER_CONFIG;
    const srcSelect = slot.querySelector('.mod-src');
    const destSelect = slot.querySelector('.mod-dest');

    srcSelect.innerHTML = MOD_SOURCES.map(src =>
        `<option value="${src.value}" ${src.value === mod.src ? 'selected' : ''}>${src.label}</option>`
    ).join('');

    const cellmode = padData.params.multisammode === '1' ? '0-multi' : (padData.params.cellmode || '0');
    const destinations = MOD_DESTINATIONS[cellmode] || MOD_DESTINATIONS['0'];

    destSelect.innerHTML = destinations.map(dest =>
        `<option value="${dest.value}" ${dest.value === mod.dest ? 'selected' : ''}>${dest.label}</option>`
    ).join('');
}

function addModSlot() {
    const { currentEditingPad, presetData } = window.BitboxerData;
    if (!currentEditingPad) return;

    const row = parseInt(currentEditingPad.dataset.row);
    const col = parseInt(currentEditingPad.dataset.col);
    const padData = presetData.pads[row][col];

    if (!Array.isArray(padData.modsources)) {
        padData.modsources = [];
    }

    const nextSlot = padData.modsources.length;
    padData.modsources.push({
        src: 'none',
        dest: 'none',
        slot: nextSlot,
        amount: '0'
    });

    renderModSlots(padData);
}

function removeModSlot(index) {
    const { currentEditingPad, presetData } = window.BitboxerData;
    if (!currentEditingPad) return;

    const row = parseInt(currentEditingPad.dataset.row);
    const col = parseInt(currentEditingPad.dataset.col);
    const padData = presetData.pads[row][col];

    padData.modsources.splice(index, 1);
    renderModSlots(padData);
}

function updateModalIcon(padData) {
    const icon = document.getElementById('modalIcon');
    if (!icon) return;

    if (padData.params.multisammode === '1') {
        icon.textContent = '🎹';
        return;
    }

    const mode = padData.params.cellmode || '0';
    const icons = {
        '0': '🔊',
        '1': '📏',
        '2': '✂️',
        '3': '✨'
    };
    icon.textContent = icons[mode] || '🔊';
}

async function initSampleEditor(padData) {
    if (!window.BitboxerSampleEditor) {
        window.BitboxerSampleEditor = new SampleEditor();
        await window.BitboxerSampleEditor.init('waveformCanvas');

        window.BitboxerSampleEditor.scrollZoomBar = new ScrollZoomBar(
            window.BitboxerSampleEditor.renderer,
            () => window.BitboxerSampleEditor.render()
        );
        window.BitboxerSampleEditor.scrollZoomBar.init('scrollZoomCanvas');
    }

    const mode = padData.params.multisammode === '1' ? '0' : (padData.params.cellmode || '0');
    window.BitboxerSampleEditor.setMode(mode);

    if (!padData.filename || padData.params.multisammode === '1') {
        window.BitboxerSampleEditor.clearAudioData();
        window.BitboxerSampleEditor.render();
        return;
    }

    const wavName = padData.filename.split(/[/\\]/).pop();
    const file = window._lastImportedFiles?.get(wavName);
    if (!file) {
        window.BitboxerSampleEditor.clearAudioData();
        window.BitboxerSampleEditor.render();
        return;
    }

    const audioBuffer = await window.BitboxerSampleEditor.loadSample(file);
    if (!audioBuffer) {
        window.BitboxerSampleEditor.clearAudioData();
        window.BitboxerSampleEditor.render();
        return;
    }

    window.BitboxerSampleEditor.markerController.syncFromPadParams(padData);
    window.BitboxerSampleEditor.updateGranularParams();
    window.BitboxerSampleEditor.render();

    if (padData.params.multisammode === '1') {
        renderMultisampleList();
    }
}

function renderMultisampleList() {
    const { currentEditingPad, assetCells } = window.BitboxerData;
    const container = document.getElementById('multiAssetList');
    if (!container || !currentEditingPad) return;

    const row = parseInt(currentEditingPad.dataset.row);
    const col = parseInt(currentEditingPad.dataset.col);
    const assets = assetCells.filter(asset =>
        parseInt(asset.params.asssrcrow) === row &&
        parseInt(asset.params.asssrccol) === col
    );

    container.innerHTML = '';

    assets.forEach(asset => {
        const item = document.createElement('button');
        item.className = 'btn multi-asset-item';
        item.textContent = asset.filename.split(/[/\\]/).pop();
        item.onclick = async () => {
            await loadMultisampleAssetToEditor(asset);
            if (window._multiKeyboardViz) {
                window._multiKeyboardViz.selectAsset(asset);
            }
        };
        container.appendChild(item);
    });

    const addLayerBtn = document.getElementById('addLayerBtn');
    if (addLayerBtn) {
        addLayerBtn.onclick = async () => {
            if (!window.BitboxerSampleBrowser) {
                window.BitboxerUtils.setStatus('Sample browser unavailable. Use Chrome or Edge for local folder access.', 'error');
                return;
            }

            await window.BitboxerSampleBrowser.open({
                mode: 'multisample',
                targetPad: currentEditingPad,
                assignment: {
                    rootNote: 60,
                    keyRangeBottom: 60,
                    keyRangeTop: 60,
                    velRangeBottom: 0,
                    velRangeTop: 127
                }
            });
        };
    }
}

async function parseAssetsWAVMetadata() {
    const { assetCells } = window.BitboxerData;
    if (!Array.isArray(assetCells) || assetCells.length === 0) return;

    for (const asset of assetCells) {
        const wavName = (asset.filename || '').split(/[/\\]/).pop();
        const file = window._lastImportedFiles?.get(wavName);
        if (!file) continue;

        try {
            const result = await window.BitboxerFileHandler.FileImporter.import(file);
            const wavData = result?.wavFiles?.[0];
            if (wavData?.metadata) {
                asset.wavMetadata = {
                    sampleRate: wavData.metadata.sampleRate || 44100,
                    numChannels: wavData.metadata.channels || wavData.metadata.numChannels || 1,
                    bitsPerSample: wavData.metadata.bitsPerSample || 16,
                    duration: wavData.metadata.duration || 0,
                    samlen: wavData.metadata.samlen || Math.floor((wavData.metadata.sampleRate || 44100) * (wavData.metadata.duration || 0)),
                    loopStart: wavData.metadata.loopPoints?.start || 0,
                    loopEnd: wavData.metadata.loopPoints?.end || 0,
                    hasLoop: Boolean(wavData.metadata.loopPoints),
                    rootKey: parseInt(asset.params.rootnote, 10) || 60
                };
            }
        } catch (error) {
            console.warn('Failed to parse WAV metadata for asset:', wavName, error);
        }
    }
}

// ============================================
// FIXED: loadMultisampleAssetToEditor
// ============================================

/**
 * Loads asset into multisample editor
 * FIXED: Clears previous data, sets correct samlen, green markers
 */
async function loadMultisampleAssetToEditor(asset) {
        console.log('==========================================');
        console.log('=== loadMultisampleAssetToEditor CALLED ===');
        console.log('Asset filename:', asset.filename);
        console.log('Asset rootnote:', asset.params.rootnote);
        console.log('Asset keyrangebottom:', asset.params.keyrangebottom);
        console.log('Asset keyrangetop:', asset.params.keyrangetop);
        console.log('Current state.currentAsset:', window._multiEditorState.currentAsset?.filename);
        console.log('Current state.hasLoadedAudio:', window._multiEditorState.hasLoadedAudio);
        console.log('Current state.audioBuffer exists:', !!window._multiEditorState.audioBuffer);
        console.log('==========================================');

    const editPanel = document.getElementById('multiEditPanel');
    const sampleNameSpan = document.getElementById('multiSampleName');
    
    if (!asset || !editPanel) {
        console.log('❌ EXIT: No asset or editPanel');
        return;
    }
    
    const isDifferentAsset = (window._multiEditorState.currentAsset !== asset);

    // If clicking same asset that's already loaded, do nothing
    if (!isDifferentAsset && window._multiEditorState.hasLoadedAudio) {
        console.log('✅ Same asset already loaded, skipping');
        return;
    }

    // If different asset, always do full reload (load new WAV)
    if (isDifferentAsset) {
        console.log('🔄 Different asset detected, doing full reload');
        window._multiEditorState.setAsset(asset);
        // Continue to full reload below...
    }

    // If same asset but audio lost, also do full reload
    if (!isDifferentAsset && !window._multiEditorState.hasLoadedAudio) {
        console.log('🔄 Same asset but audio lost, reloading');
        // Continue to full reload below...
    }
    
    console.log('🔄 Loading asset (audio buffer missing or stale)');

    // Update state
    window._multiEditorState.setAsset(asset);
    
    // Show edit panel
    editPanel.style.display = 'block';
    
    // Update sample name
    const wavName = asset.filename.split(/[/\\]/).pop();
    sampleNameSpan.textContent = wavName;
    
    // Initialize multi-sample editor if needed
    if (!window._multiSampleEditor) {
        window._multiSampleEditor = new SampleEditor();
        await window._multiSampleEditor.init('multiWaveformCanvas');

        window._multiSampleEditor.scrollZoomBar = new ScrollZoomBar(
            window._multiSampleEditor.renderer,
            () => {
                window._multiSampleEditor.render();
            }
        );
        window._multiSampleEditor.scrollZoomBar.init('multiScrollZoomCanvas');

        // Setup playback controls
        document.getElementById('multiPlayBtn').onclick = () => {
            const loopEnabled = (document.getElementById('multiLoopEnabled').value === '1');
            window._multiSampleEditor.audioEngine.play({
                startSample: 0,
                endSample: window._multiSampleEditor.audioEngine.audioBuffer.length,
                loopStartSample: parseInt(document.getElementById('multiLoopStart').value) || 0,
                loopEndSample: parseInt(document.getElementById('multiLoopEnd').value) || 0,
                loopEnabled: loopEnabled,
                reverse: false
            });
        };
        
        document.getElementById('multiStopBtn').onclick = () => 
            window._multiSampleEditor.stop();
    } else {
        // Clear previous audio data when switching assets
        window._multiSampleEditor.clearAudioData();
    }
    
    // Load WAV file
    if (window._lastImportedFiles && window._lastImportedFiles.has(wavName)) {
        const wavFile = window._lastImportedFiles.get(wavName);
        const audioBuffer = await window._multiSampleEditor.loadSample(wavFile);
        
        if (!audioBuffer) {
            console.error('❌ Failed to load audio buffer');
            return;
        }
        
        // Set mode to sample mode
        window._multiSampleEditor.setMode('0');
        
        // Configure loop markers from WAV metadata
        if (asset.wavMetadata) {
            const { loopStart, loopEnd, hasLoop, samlen } = asset.wavMetadata;

            console.log(`Configuring loop markers: start=${loopStart}, end=${loopEnd}, samlen=${samlen}`);

            const markers = window._multiSampleEditor.markerController.markers;
            const themeColors = window._multiSampleEditor.renderer.getThemeColors();
            window._multiSampleEditor.markerController.applyThemeColors({
                hideSampleMarkers: true,
                loopColor: themeColors.markerSlice
            });

            // Set loop points from WAV
            const finalLoopEnd = loopEnd || samlen || audioBuffer.length;
            window._multiSampleEditor.markerController.setMarker('loopStart', loopStart);
            window._multiSampleEditor.markerController.setMarker('loopEnd', finalLoopEnd);

            // Store in unified state
            window._multiEditorState.setAudioData(
                audioBuffer,
                loopStart,
                finalLoopEnd,
                hasLoop
            );
        }
        
        window._multiSampleEditor.render();
    }
    
    // Populate edit panel with current values
    populateMultisampleEditPanel(asset);
}

function playSelectedMultisampleAsset() {
    if (!window._multiSampleEditor?.audioEngine?.audioBuffer) {
        return;
    }

    const loopStart = parseInt(document.getElementById('multiLoopStart')?.value, 10) || 0;
    const loopEnd = parseInt(document.getElementById('multiLoopEnd')?.value, 10) || window._multiSampleEditor.audioEngine.audioBuffer.length;

    window._multiSampleEditor.stop();
    window._multiSampleEditor.audioEngine.play({
        startSample: 0,
        endSample: window._multiSampleEditor.audioEngine.audioBuffer.length,
        loopStartSample: loopStart,
        loopEndSample: loopEnd,
        loopEnabled: false,
        reverse: false
    });
}

// ============================================
// FIXED: populateMultisampleEditPanel
// ============================================

/**
 * Populates edit panel with asset data
 * FIXED: Correct samlen from audioBuffer, two-way binding
 */
function populateMultisampleEditPanel(asset) {
    console.log('>>> populateMultisampleEditPanel CALLED');
    console.log('>>> Asset:', asset.filename);
    console.log('>>> Asset.params.rootnote:', asset.params.rootnote);
    console.log('>>> Asset.params.keyrangebottom:', asset.params.keyrangebottom);
    console.log('>>> Asset.params.keyrangetop:', asset.params.keyrangetop);
    
    // Populate note dropdowns (0-127)
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    
    ['multiRootNote', 'multiKeyLo', 'multiKeyHi'].forEach(id => {
        const select = document.getElementById(id);
        if (select && select.options.length === 0) {
            console.log(`Populating dropdown: ${id}`);
            for (let i = 0; i <= 127; i++) {
                const octave = Math.floor((i - 12) / 12);
                const note = noteNames[i % 12];
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `${note}${octave} (${i})`;
                select.appendChild(option);
            }
        }
    });
    
    // Set values WITH LOGGING
    const rootSelect = document.getElementById('multiRootNote');
    const loSelect = document.getElementById('multiKeyLo');
    const hiSelect = document.getElementById('multiKeyHi');

    console.log('Setting dropdown values...');
    if (rootSelect) {
        console.log(`  Setting multiRootNote to: "${asset.params.rootnote}"`);
        rootSelect.value = asset.params.rootnote;
        console.log(`  After set, multiRootNote.value is: "${rootSelect.value}"`);
    }

    if (loSelect) {
        console.log(`  Setting multiKeyLo to: "${asset.params.keyrangebottom}"`);
        loSelect.value = asset.params.keyrangebottom;
        console.log(`  After set, multiKeyLo.value is: "${loSelect.value}"`);
    }

    if (hiSelect) {
        console.log(`  Setting multiKeyHi to: "${asset.params.keyrangetop}"`);
        hiSelect.value = asset.params.keyrangetop;
        console.log(`  After set, multiKeyHi.value is: "${hiSelect.value}"`);
    }

    document.getElementById('multiVelLo').value = asset.params.velrangebottom;
    document.getElementById('multiVelHi').value = asset.params.velrangetop;
    
    console.log('=== populateMultisampleEditPanel END ===');

    // Set loop points and slider max from audioBuffer
    if (window._multiSampleEditor && window._multiSampleEditor.audioEngine && window._multiSampleEditor.audioEngine.audioBuffer) {
        const audioBuffer = window._multiSampleEditor.audioEngine.audioBuffer;
        const maxSamples = audioBuffer.length;

        console.log(`Setting slider max to audioBuffer.length: ${maxSamples}`);

        // Set slider max
        const startSlider = document.getElementById('multiLoopStart');
        const endSlider = document.getElementById('multiLoopEnd');

        if (startSlider) startSlider.max = maxSamples;
        if (endSlider) endSlider.max = maxSamples;

        // Set current values from WAV metadata
        if (asset.wavMetadata) {
            const loopStart = asset.wavMetadata.loopStart || 0;
            const loopEnd = asset.wavMetadata.loopEnd || maxSamples;
            const hasLoop = asset.wavMetadata.hasLoop || false;

            console.log(`Setting loop values: start=${loopStart}, end=${loopEnd}, enabled=${hasLoop}`);

            if (startSlider) {
                startSlider.value = loopStart;
                const startVal = document.getElementById('multiLoopStart-val');
                if (startVal) startVal.textContent = loopStart;
            }

            if (endSlider) {
                endSlider.value = loopEnd;
                const endVal = document.getElementById('multiLoopEnd-val');
                if (endVal) endVal.textContent = loopEnd;
            }

            const enabledSelect = document.getElementById('multiLoopEnabled');
            if (enabledSelect) enabledSelect.value = hasLoop ? '1' : '0';
        }
    } else {
        console.warn('Audio buffer not available, using defaults');
    }
    
    // Setup event listeners for changes
    setupMultisampleEditListeners(asset);
}

// ============================================
// FIXED: setupMultisampleEditListeners
// ============================================

/**
 * Setup event listeners with TWO-WAY binding
 * FIXED: Markers update sliders, sliders update markers
 */
function setupMultisampleEditListeners(asset) {
    // Remove old listeners to prevent duplicates
    const loopStartSlider = document.getElementById('multiLoopStart');
    const loopEndSlider = document.getElementById('multiLoopEnd');
    const loopEnabledSelect = document.getElementById('multiLoopEnabled');
    
    // Clone and replace to remove old listeners
    if (loopStartSlider) {
        const newStart = loopStartSlider.cloneNode(true);
        loopStartSlider.parentNode.replaceChild(newStart, loopStartSlider);
    }
    if (loopEndSlider) {
        const newEnd = loopEndSlider.cloneNode(true);
        loopEndSlider.parentNode.replaceChild(newEnd, loopEndSlider);
    }
    
    // Get fresh references
    const startSlider = document.getElementById('multiLoopStart');
    const endSlider = document.getElementById('multiLoopEnd');
    const enabledSelect = document.getElementById('multiLoopEnabled');
    
    // Key/velocity changes
    ['multiRootNote', 'multiKeyLo', 'multiKeyHi', 'multiVelLo', 'multiVelHi'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.onchange = () => {
                updateAssetFromEditPanel(asset);
            };
        }
    });
    
    // FIXED: Loop point sliders with two-way binding
    if (startSlider) {
        startSlider.oninput = () => {
            const value = parseInt(startSlider.value);
            asset.wavMetadata.loopStart = value;
            document.getElementById('multiLoopStart-val').textContent = value;
            
            // Update marker
            if (window._multiSampleEditor) {
                window._multiSampleEditor.markerController.setMarker('loopStart', value);
                window._multiSampleEditor.render();
            }
        };
    }
    
    if (endSlider) {
        endSlider.oninput = () => {
            const value = parseInt(endSlider.value);
            asset.wavMetadata.loopEnd = value;
            document.getElementById('multiLoopEnd-val').textContent = value;
            
            // Update marker
            if (window._multiSampleEditor) {
                window._multiSampleEditor.markerController.setMarker('loopEnd', value);
                window._multiSampleEditor.render();
            }
        };
    }
    
    // Loop enabled toggle - updates both metadata and playback
    if (enabledSelect) {
        enabledSelect.onchange = () => {
            const enabled = (enabledSelect.value === '1');
            asset.wavMetadata.hasLoop = enabled;
            console.log(`Loop enabled changed to: ${enabled}`);

            // If playing, restart with new loop setting
            if (window._multiSampleEditor && window._multiSampleEditor.audioEngine.isPlaying) {
                window._multiSampleEditor.stop();
                setTimeout(() => {
                    window._multiSampleEditor.audioEngine.play({
                        startSample: 0,
                        endSample: window._multiSampleEditor.audioEngine.audioBuffer.length,
                        loopStartSample: parseInt(document.getElementById('multiLoopStart').value) || 0,
                        loopEndSample: parseInt(document.getElementById('multiLoopEnd').value) || 0,
                        loopEnabled: enabled,
                        reverse: false
                    });
                }, 100);
            }
        };
    }
    
    // NEW: Two-way binding - marker drag updates sliders
    setupMarkerToSliderSync(asset);

    // NEW: Key/velocity range dropdowns → Update keyboard zones
    ['multiRootNote', 'multiKeyLo', 'multiKeyHi', 'multiVelLo', 'multiVelHi'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            // SAVE THE CURRENT VALUE
            const currentValue = element.value;

            // Remove old listener
            const newElement = element.cloneNode(true);

            // RESTORE THE VALUE
            newElement.value = currentValue;

            element.parentNode.replaceChild(newElement, element);

            // Add new listener
            document.getElementById(id).addEventListener('change', () => {
                updateAssetFromEditPanel(asset);

                // Force keyboard re-render with updated asset data
                if (window._multiKeyboardViz) {
                    // Get fresh asset list from BitboxerData
                    const { currentEditingPad, presetData, assetCells } = window.BitboxerData;
                    if (currentEditingPad) {
                        const row = parseInt(currentEditingPad.dataset.row);
                        const col = parseInt(currentEditingPad.dataset.col);

                        // Filter assets for this pad
                        const assets = assetCells.filter(a =>
                            parseInt(a.params.asssrcrow) === row &&
                            parseInt(a.params.asssrccol) === col
                        );

                        // Update visualizer with fresh data
                        window._multiKeyboardViz.assetCells = assets;
                        window._multiKeyboardViz.resize();
                        window._multiKeyboardViz.render();
                    }
                }
            });
        }
    });
}

// ============================================
// NEW: Marker to Slider Sync
// ============================================

/**
 * Syncs marker dragging to slider values (two-way binding)
 */
function setupMarkerToSliderSync(asset) {
    if (!window._multiSampleEditor || !window._multiSampleEditor.markerController) {
        console.warn('Cannot setup marker sync: editor not initialized');
        return;
    }
    
    const markerController = window._multiSampleEditor.markerController;
    
    // Clear any previous override
    if (markerController._originalUpdatePadParams) {
        markerController.updatePadParams = markerController._originalUpdatePadParams;
    }
    
    // Store original function
    if (!markerController._originalUpdatePadParams) {
        markerController._originalUpdatePadParams = markerController.updatePadParams;
    }
    
    // Override to sync to sliders
    markerController.updatePadParams = function() {
        // Get marker positions
        const loopStart = this.markers.loopStart.sample;
        const loopEnd = this.markers.loopEnd.sample;
        
        // Validate
        if (isNaN(loopStart) || isNaN(loopEnd)) {
            console.warn('Invalid marker positions:', loopStart, loopEnd);
            return;
        }
        
        console.log(`Marker moved: loopStart=${loopStart}, loopEnd=${loopEnd}`);
        
        // Update sliders
        const startSlider = document.getElementById('multiLoopStart');
        const endSlider = document.getElementById('multiLoopEnd');
        
        if (startSlider) {
            startSlider.value = loopStart;
            const startVal = document.getElementById('multiLoopStart-val');
            if (startVal) startVal.textContent = loopStart;
            if (asset.wavMetadata) asset.wavMetadata.loopStart = loopStart;
        }
        
        if (endSlider) {
            endSlider.value = loopEnd;
            const endVal = document.getElementById('multiLoopEnd-val');
            if (endVal) endVal.textContent = loopEnd;
            if (asset.wavMetadata) asset.wavMetadata.loopEnd = loopEnd;
        }
    };
}

/**
 * Enhanced updateAssetFromEditPanel to include keyboard refresh
 */
function updateAssetFromEditPanel(asset) {
    asset.params.rootnote = document.getElementById('multiRootNote').value;
    asset.params.keyrangebottom = document.getElementById('multiKeyLo').value;
    asset.params.keyrangetop = document.getElementById('multiKeyHi').value;
    asset.params.velrangebottom = document.getElementById('multiVelLo').value;
    asset.params.velrangetop = document.getElementById('multiVelHi').value;
    
    // Refresh keyboard visualizer
    if (window._multiKeyboardViz) {
        window._multiKeyboardViz.render();
    }
}

/**
 * Forces keyboard refresh after any asset modification
 */
function refreshKeyboardVisualization() {
    if (window._multiKeyboardViz) {
        // Re-render with current asset data
        window._multiKeyboardViz.render();
    }
}

// ============================================
// EXPORT PAD EDITOR
// ============================================
window.BitboxerPadEditor = {
    openEditModal,
    loadParamsToModal,
    updateSliderMaxValues, 
    setupParameterListeners,
    drawEnvelope,
    renderModSlots,
    addModSlot,
    removeModSlot,
    updateModSlotAppearance,
    renderMultisampleList,
    updateModalIcon,
    initSampleEditor,
    loadMultisampleAssetToEditor,
    populateMultisampleEditPanel,
    parseAssetsWAVMetadata,
    setupMarkerToSliderSync,
    refreshKeyboardVisualization
};
