/**
 * BITBOXER - Import Handler
 * 
 * Orchestrates all file import operations:
 * - Unified import routing (XML/ZIP/SFZ/WAV)
 * - SFZ to preset/pad conversion
 * - Missing sample resolution
 * - Preset merging
 * - Auto-loading referenced samples
 */

// ============================================
// UNIFIED IMPORT ROUTER
// ============================================

/**
 * Unified import handler - routes files to appropriate processors
 * Handles XML, ZIP, SFZ, WAV, JSON individually or in bulk
 * 
 * @param {File|Array} files - File(s) to import
 * @param {string} source - Import source ('button', 'drag-grid', 'drag-pad', 'folder')
 * @param {HTMLElement} targetPad - Target pad for single-file imports (optional)
 */
async function unifiedImportHandler(files, source, targetPad = null) {
    console.log('=== UNIFIED HANDLER ===');
    console.log('Files:', files);
    console.log('Source:', source);
    
    const fileArray = Array.isArray(files) ? files : [files];
    
    // File type detection
    const hasXML = fileArray.some(f => f.name.endsWith('.xml'));
    const hasZIP = fileArray.some(f => f.name.endsWith('.zip'));
    const hasSFZ = fileArray.some(f => f.name.endsWith('.sfz'));
    const hasWAV = fileArray.some(f => f.name.endsWith('.wav'));
    const hasJSON = fileArray.some(f => f.name.endsWith('.json'));
    
    // Single file handling
    if (fileArray.length === 1) {
        const file = fileArray[0];
        
        // JSON pad export
        if (hasJSON) {
            if (!targetPad) {
                window.BitboxerUtils.setStatus('JSON must target specific pad', 'error');
                return;
            }
            await loadPadFromJSON(file, targetPad);
            return;
        }
        
        // XML preset
        if (hasXML) {
            const choice = await promptLoadOrMerge();
            if (choice === 'cancel') return;
            
            if (choice === 'replace') {
                window.BitboxerData.createEmptyPreset();
                await window.BitboxerXML.loadPreset(file);
                await autoLoadReferencedSamples();
            } else {
                await mergePreset(file);
                await autoLoadReferencedSamples();
            }
            return;
        }
        
        // ZIP file - examine contents
        if (hasZIP) {
            try {
                window.BitboxerUtils.setStatus('Processing ZIP...', 'info');
                
                const result = await window.BitboxerFileHandler.FileImporter.import(file);
                // window._lastImportedFiles = result.collection.files;
                
                const hasPresetXML = result.xmlFiles.length > 0;
                const hasPadJSON = Array.from(result.collection.files.keys())
                    .some(path => /pad_\d{2}\.json/.test(path));
                const hasSFZInside = result.sfzFiles.length > 0;
                
                if (hasPadJSON) {
                    if (!targetPad) {
                        window.BitboxerUtils.setStatus('Pad ZIP must target specific pad', 'error');
                        return;
                    }
                    await loadPadFromZIP(file, targetPad);
                    return;
                }
                
                if (hasPresetXML) {
                    const choice = await promptLoadOrMerge();
                    if (choice === 'cancel') return;
                    
                    if (choice === 'replace') {
                        window.BitboxerData.createEmptyPreset();
                        await window.BitboxerXML.loadPreset(result.xmlFiles[0].file);
                        await autoLoadReferencedSamples();
                    } else {
                        await mergePreset(result.xmlFiles[0].file);
                        await autoLoadReferencedSamples();
                    }
                    return;
                }
                
                if (hasSFZInside) {
                    if (!targetPad) {
                        window.BitboxerUtils.setStatus('SFZ must target specific pad', 'error');
                        return;
                    }
                    const importResult = await handleMissingSamples(result.sfzFiles[0], result.wavFiles);
                    if (!importResult.cancelled) {
                        await convertSFZToPad(result.sfzFiles[0], importResult.wavFiles, targetPad);
                    }
                    return;
                }
                
                window.BitboxerUtils.setStatus('ZIP contains no valid preset/pad', 'error');
            } catch (error) {
                console.error('ZIP import error:', error);
                window.BitboxerUtils.setStatus(`ZIP import failed: ${error.message}`, 'error');
            }
            return;
        }
        
        // SFZ file
        if (hasSFZ) {
            if (!targetPad) {
                window.BitboxerUtils.setStatus('SFZ must target specific pad', 'error');
                return;
            }
            try {
                window.BitboxerUtils.setStatus('Processing SFZ...', 'info');
                const result = await window.BitboxerFileHandler.FileImporter.import(file);
                if (result.sfzFiles.length > 0) {
                    const importResult = await handleMissingSamples(result.sfzFiles[0], result.wavFiles);
                    if (!importResult.cancelled) {
                        await convertSFZToPad(result.sfzFiles[0], importResult.wavFiles, targetPad);
                    }
                }
            } catch (error) {
                console.error('SFZ import error:', error);
                window.BitboxerUtils.setStatus(`SFZ import failed: ${error.message}`, 'error');
            }
            return;
        }
        
        // WAV file
        if (hasWAV) {
            if (!targetPad) {
                window.BitboxerUtils.setStatus('WAV must target specific pad', 'error');
                return;
            }
            
            try {
                window.BitboxerUtils.setStatus('Processing WAV...', 'info');
                
                // Cache file
                if (!window._lastImportedFiles) window._lastImportedFiles = new Map();
                window._lastImportedFiles.set(file.name, file);
                
                const result = await window.BitboxerFileHandler.FileImporter.import(file);
                const wavData = result.wavFiles[0];
                
                const row = parseInt(targetPad.dataset.row);
                const col = parseInt(targetPad.dataset.col);
                const pad = window.BitboxerData.presetData.pads[row][col];
                
                pad.filename = wavData.name;
                pad.type = 'sample';
                
                // Apply WAV metadata
                const duration = wavData.metadata.duration || 0;
                if (duration > 0) {
                    const sampleRate = wavData.metadata.sampleRate || 44100;
                    const totalSamples = Math.floor(sampleRate * duration);
                    pad.params.samlen = totalSamples.toString();
                    if (pad.params.loopend === '0') {
                        pad.params.loopend = totalSamples.toString();
                    }
                }
                
                if (wavData.metadata.loopPoints) {
                    pad.params.loopstart = wavData.metadata.loopPoints.start.toString();
                    pad.params.loopend = wavData.metadata.loopPoints.end.toString();
                    pad.params.loopmode = '1';
                    if (wavData.metadata.loopPoints.type === 1) {
                        pad.params.loopmodes = '2';
                    }
                }
                
                if (wavData.metadata.slices && wavData.metadata.slices.length > 1) {
                    pad.params.cellmode = '2';
                    pad.slices = wavData.metadata.slices.map(pos => ({ pos: pos.toString() }));
                }
                
                if (wavData.metadata.tempo) {
                    window.BitboxerData.presetData.tempo = Math.round(wavData.metadata.tempo).toString();
                }
                
                window.BitboxerUI.updatePadDisplay();
                await refreshPadEditorIfOpen(targetPad);

                window.BitboxerUtils.setStatus(`Loaded ${wavData.name}`, 'success');
            } catch (error) {
                console.error('WAV import error:', error);
                window.BitboxerUtils.setStatus(`WAV failed: ${error.message}`, 'error');
            }
            return;
        }
    }
    
    // Multiple files = bulk preset import
    if (fileArray.length > 1) {
        if (!confirm(`Import ${fileArray.length} files? All pads will be lost!`)) return;
        
        try {
            window.BitboxerUtils.setStatus('Importing files...', 'info');
            const result = await window.BitboxerFileHandler.FileImporter.import(fileArray);
            await processImportedFiles(result);
        } catch (error) {
            console.error('Import error:', error);
            window.BitboxerUtils.setStatus(`Import failed: ${error.message}`, 'error');
        }
    }
}

function cacheFilesBySimpleName(filesMap) {
    if (!filesMap) {
        return;
    }

    if (!window._lastImportedFiles) {
        window._lastImportedFiles = new Map();
    }

    filesMap.forEach((file, pathOrName) => {
        const resolvedName = (pathOrName || file?.name || '').split(/[/\\]/).pop();
        if (resolvedName) {
            window._lastImportedFiles.set(resolvedName, file);
        }
    });
}

function isSamePadTarget(padA, padB) {
    if (!padA || !padB) {
        return false;
    }

    return padA.dataset.row === padB.dataset.row && padA.dataset.col === padB.dataset.col;
}

async function ensurePadSampleCached(padData) {
    if (!padData?.filename || padData.params?.multisammode === '1') {
        return;
    }

    const wavName = padData.filename.split(/[/\\]/).pop();
    if (!wavName || !wavName.toLowerCase().endsWith('.wav')) {
        return;
    }

    if (window._lastImportedFiles?.has(wavName)) {
        return;
    }

    const foundFiles = await searchWorkingFolderForSamples([wavName]);
    if (foundFiles.length === 0) {
        return;
    }

    if (!window._lastImportedFiles) {
        window._lastImportedFiles = new Map();
    }

    foundFiles.forEach((file) => {
        window._lastImportedFiles.set(file.name, file);
    });
}

async function refreshPadEditorIfOpen(targetPad) {
    const { currentEditingPad, presetData } = window.BitboxerData;
    if (!isSamePadTarget(currentEditingPad, targetPad) || !presetData) {
        return;
    }

    const row = parseInt(currentEditingPad.dataset.row);
    const col = parseInt(currentEditingPad.dataset.col);
    const padData = presetData.pads[row][col];
    if (!padData) {
        return;
    }

    try {
        await ensurePadSampleCached(padData);

        window.BitboxerPadEditor.updateModalIcon(padData);
        const modalTitle = document.getElementById('modalTitle');
        if (modalTitle) {
            modalTitle.textContent = `Pad ${currentEditingPad.dataset.padnum} - ${padData.filename || 'Empty'}`;
        }

        window.BitboxerPadEditor.loadParamsToModal(padData);
        window.BitboxerPadEditor.renderModSlots(padData);
        window.BitboxerPadEditor.updateSliderMaxValues(padData);
        await window.BitboxerPadEditor.initSampleEditor(padData);
        window.BitboxerUI.updatePadDisplay();
        window.BitboxerUI.updateTabVisibility();
        window.BitboxerUI.updateLFOParameterVisibility();
        window.BitboxerUI.updatePosConditionalVisibility();
        window.BitboxerPadEditor.renderMultisampleList?.();

        requestAnimationFrame(() => {
            if (window.BitboxerSampleEditor?.renderer) {
                window.BitboxerSampleEditor.renderer.resize();
                window.BitboxerSampleEditor.render();
            }
            if (window.BitboxerSampleEditor?.scrollZoomBar) {
                window.BitboxerSampleEditor.scrollZoomBar.resize();
            }
        });
    } catch (error) {
        console.error('Pad editor refresh failed:', error);
    }
}

function sanitizeMultisampleFolderSegment(name) {
    const base = (name || 'Multisample')
        .replace(/\.[^.]+$/, '')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return base || 'Multisample';
}

function getOrCreateManualMultisampleFolder(pad, row, col, assetCells, preferredName = '') {
    const currentPath = (pad.filename || '').replace(/^\.?[\\\/]/, '');
    const currentParts = currentPath ? currentPath.split(/[\\\/]/).filter(Boolean) : [];
    const currentLeaf = currentParts.length > 0 ? currentParts[currentParts.length - 1] : '';
    const currentLooksLikeFile = /\.[^.]+$/.test(currentLeaf);

    let folderName = '';
    if (currentLeaf && !currentLooksLikeFile) {
        folderName = currentLeaf;
    } else {
        const padNumber = (row * 4 + col + 1).toString().padStart(2, '0');
        const preferredStem = sanitizeMultisampleFolderSegment(preferredName);
        folderName = `Pad${padNumber}_${preferredStem}`;
    }

    pad.filename = `.\\${folderName}`;

    assetCells.forEach((asset) => {
        if (parseInt(asset.params?.asssrcrow, 10) !== row || parseInt(asset.params?.asssrccol, 10) !== col) {
            return;
        }

        const sampleName = (asset.filename || '').split(/[/\\]/).pop();
        if (sampleName) {
            asset.filename = `.\\${folderName}\\${sampleName}`;
        }
    });

    return folderName;
}

async function addWavToMultisamplePad(file, targetPad, assignment = {}) {
    if (!file || !targetPad) {
        throw new Error('Missing target pad');
    }

    const row = parseInt(targetPad.dataset.row, 10);
    const col = parseInt(targetPad.dataset.col, 10);
    if (Number.isNaN(row) || Number.isNaN(col)) {
        throw new Error('Invalid target pad');
    }

    const { presetData, assetCells } = window.BitboxerData;
    const pad = presetData?.pads?.[row]?.[col];
    if (!pad) {
        throw new Error('Target pad data not found');
    }

    const targetMidi = Math.max(0, Math.min(127, parseInt(assignment.rootNote ?? 60, 10) || 60));
    const keyRangeBottom = Math.max(0, Math.min(127, parseInt(assignment.keyRangeBottom ?? targetMidi, 10) || targetMidi));
    const keyRangeTop = Math.max(keyRangeBottom, Math.min(127, parseInt(assignment.keyRangeTop ?? targetMidi, 10) || targetMidi));
    const velRangeBottom = Math.max(0, Math.min(127, parseInt(assignment.velRangeBottom ?? 0, 10) || 0));
    const velRangeTop = Math.max(velRangeBottom, Math.min(127, parseInt(assignment.velRangeTop ?? 127, 10) || 127));
    const velRoot = Math.floor((velRangeBottom + velRangeTop) / 2);

    if (!window._lastImportedFiles) {
        window._lastImportedFiles = new Map();
    }
    window._lastImportedFiles.set(file.name, file);

    const result = await window.BitboxerFileHandler.FileImporter.import(file);
    const wavData = result?.wavFiles?.[0];
    if (!wavData) {
        throw new Error('Invalid WAV import');
    }

    pad.type = 'sample';
    pad.params.multisammode = '1';
    pad.params.cellmode = '0';
    const multisampleFolder = getOrCreateManualMultisampleFolder(pad, row, col, assetCells, file.name);

    const asset = {
        row: assetCells.length,
        filename: `.\\${multisampleFolder}\\${file.name}`,
        params: {
            rootnote: targetMidi.toString(),
            keyrangebottom: keyRangeBottom.toString(),
            keyrangetop: keyRangeTop.toString(),
            velroot: velRoot.toString(),
            velrangebottom: velRangeBottom.toString(),
            velrangetop: velRangeTop.toString(),
            asssrcrow: row.toString(),
            asssrccol: col.toString()
        },
        wavMetadata: {
            sampleRate: wavData.metadata?.sampleRate || 44100,
            numChannels: wavData.metadata?.channels || wavData.metadata?.numChannels || 1,
            bitsPerSample: wavData.metadata?.bitsPerSample || 16,
            duration: wavData.metadata?.duration || 0,
            samlen: wavData.metadata?.samlen || Math.floor((wavData.metadata?.sampleRate || 44100) * (wavData.metadata?.duration || 0)),
            loopStart: wavData.metadata?.loopPoints?.start || 0,
            loopEnd: wavData.metadata?.loopPoints?.end || 0,
            hasLoop: Boolean(wavData.metadata?.loopPoints),
            rootKey: targetMidi
        }
    };

    assetCells.push(asset);
    window.BitboxerUI.updatePadDisplay();
    await refreshPadEditorIfOpen(targetPad);

    if (window._multiKeyboardViz) {
        window._multiKeyboardViz.selectAsset?.(asset);
    } else if (window.BitboxerPadEditor?.loadMultisampleAssetToEditor) {
        await window.BitboxerPadEditor.loadMultisampleAssetToEditor(asset);
    }

    window.BitboxerUtils.setStatus(`Added multisample layer ${file.name} on ${targetMidi}`, 'success');
    return asset;
}

// ============================================
// PROCESSED FILES HANDLER
// ============================================

/**
 * Processes imported files after FileHandler collection
 * Routes SFZ/WAV to appropriate converters
 * 
 * @param {Object} result - Processed file collection from FileHandler
 */
async function processImportedFiles(result) {
    // window._lastImportedFiles = result.collection.files;
    
    try {
        // SFZ files with samples
        if (result.sfzFiles.length > 0) {
            const sfzFile = result.sfzFiles[0];
            const importResult = await handleMissingSamples(sfzFile, result.wavFiles);
            
            if (importResult.cancelled) {
                window.BitboxerUtils.setStatus('Import cancelled', 'info');
                return;
            }
            
            await convertSFZToPreset(sfzFile, importResult.wavFiles);
            return;
        }
        
        // Just WAV files
        if (result.wavFiles.length > 0) {
            assignWAVsToPads(result.wavFiles);
            return;
        }
        
        window.BitboxerUtils.setStatus('No supported files found', 'error');
    } catch (error) {
        console.error('Processing error:', error);
        window.BitboxerUtils.setStatus(`Import failed: ${error.message}`, 'error');
    }
}

// ============================================
// SFZ CONVERSION
// ============================================

/**
 * Converts SFZ to full preset (all regions as multisample on one pad)
 * 
 * @param {Object} sfzData - Parsed SFZ data
 * @param {Array} wavFiles - Array of WAV file data
 */
async function convertSFZToPreset(sfzData, wavFiles) {
    window.BitboxerData.createEmptyPreset();
    
    if (!window.BitboxerData.projectName || window.BitboxerData.projectName === '') {
        window.BitboxerData.initializeProject();
    }
    
    const { presetData } = window.BitboxerData;
    const row = 0, col = 0;
    const pad = presetData.pads[row][col];
    
    // Setup multisample mode
    pad.type = 'sample';
    pad.params.multisammode = '1';
    
    const multisamFolder = sfzData.file.name.replace('.sfz', '');
    pad.filename = `.\\${multisamFolder}`;
    
    // Create asset cells
    const assetCells = [];
    let validRegions = 0;
    
    for (let i = 0; i < sfzData.regions.length; i++) {
        const region = sfzData.regions[i];
        if (!region.wavFile) continue;
        
        const asset = createAssetFromSFZRegion(region, row, col, i);
        assetCells.push(asset);
        validRegions++;
    }
    
    window.BitboxerData.assetCells = assetCells;
    
    if (sfzData.global) {
        applySFZOpcodesToPad(pad, sfzData.global, {});
    }
    
    window.BitboxerUI.updatePadDisplay();
    window.BitboxerUtils.setStatus(
        `Imported multisample: ${validRegions} layers from ${sfzData.file.name}`,
        'success'
    );
}

/**
 * Converts SFZ to single pad multisample
 * 
 * @param {Object} sfzData - Parsed SFZ data
 * @param {Array} wavFiles - Array of WAV file data
 * @param {HTMLElement} targetPad - Target pad element
 */
async function convertSFZToPad(sfzData, wavFiles, targetPad) {
    const row = parseInt(targetPad.dataset.row);
    const col = parseInt(targetPad.dataset.col);
    const { presetData } = window.BitboxerData;
    const pad = presetData.pads[row][col];
    
    // Setup multisample mode
    pad.type = 'sample';
    pad.params.multisammode = '1';
    pad.params.cellmode = '0';
    
    const multisamFolder = sfzData.file.name.replace('.sfz', '');
    pad.filename = `.\\${multisamFolder}`;
    
    // Remove existing assets for this pad
    window.BitboxerData.assetCells = window.BitboxerData.assetCells.filter(asset =>
        !(parseInt(asset.params.asssrcrow) === row &&
          parseInt(asset.params.asssrccol) === col)
    );
    
    // Add new assets
    let validRegions = 0;
    for (let i = 0; i < sfzData.regions.length; i++) {
        const region = sfzData.regions[i];
        if (!region.wavFile) continue;
        
        const asset = createAssetFromSFZRegion(region, row, col, window.BitboxerData.assetCells.length);
        window.BitboxerData.assetCells.push(asset);
        validRegions++;
    }
    
    // Apply global opcodes if any
    if (sfzData.global) {
        applySFZOpcodesToPad(pad, sfzData.global, {});
    }
    
    window.BitboxerUI.updatePadDisplay();
    await refreshPadEditorIfOpen(targetPad);
    window.BitboxerUtils.setStatus(
        `Imported ${validRegions} multisample layer(s) to pad ${targetPad.dataset.padnum}`,
        'success'
    );
}

/**
 * Creates an asset cell from an SFZ region
 * 
 * @param {Object} region - SFZ region data
 * @param {number} sourceRow - Source pad row
 * @param {number} sourceCol - Source pad col
 * @param {number} assetIndex - Asset index
 * @returns {Object} Asset cell object
 */
function createAssetFromSFZRegion(region, sourceRow, sourceCol, assetIndex) {
    const samplePath = region.sample || region.wavFile?.name || '';
    const wavName = samplePath.split(/[/\\]/).pop();
    const folderName = region.folderName || (region.parentFolder || '').split(/[/\\]/).pop() || '';
    const filename = folderName ? `.\\${folderName}\\${wavName}` : `.\\${wavName}`;

    return {
        row: assetIndex,
        filename,
        params: {
            rootnote: (region.pitch_keycenter ?? region.key ?? 60).toString(),
            keyrangebottom: (region.lokey ?? region.key ?? 0).toString(),
            keyrangetop: (region.hikey ?? region.key ?? 127).toString(),
            velroot: Math.floor(((region.lovel ?? 0) + (region.hivel ?? 127)) / 2).toString(),
            velrangebottom: (region.lovel ?? 0).toString(),
            velrangetop: (region.hivel ?? 127).toString(),
            asssrcrow: sourceRow.toString(),
            asssrccol: sourceCol.toString()
        },
        wavMetadata: region.wavFile?.metadata || null
    };
}

/**
 * Applies SFZ opcodes to pad parameters
 * 
 * @param {Object} pad - Target pad data
 * @param {Object} opcodes - SFZ opcode map
 * @param {Object} overrides - Optional override map
 */
function applySFZOpcodesToPad(pad, opcodes, overrides = {}) {
    const map = {
        volume: ['gaindb', v => Math.round(parseFloat(v) * 10)],
        transpose: ['pitch', v => Math.round(parseFloat(v) * 100)],
        pan: ['panpos', v => Math.round(parseFloat(v) * 10)],
        fil_type: ['filtype', v => v],
        cutoff: ['dualfilcutoff', v => Math.round(parseFloat(v))],
        resonance: ['res', v => Math.round(parseFloat(v) * 10)],
        amp_veltrack: ['veltrack', v => Math.round(parseFloat(v))],
        ampeg_attack: ['envattack', v => Math.round(parseFloat(v) * 1000)],
        ampeg_decay: ['envdecay', v => Math.round(parseFloat(v) * 1000)],
        ampeg_sustain: ['envsus', v => Math.round(parseFloat(v))],
        ampeg_release: ['envrel', v => Math.round(parseFloat(v) * 1000)]
    };

    const merged = { ...opcodes, ...overrides };
    Object.entries(merged).forEach(([opcode, value]) => {
        const mapping = map[opcode];
        if (mapping) {
            const [param, transform] = mapping;
            pad.params[param] = transform(value).toString();
        }
    });
}

// ============================================
// MISSING SAMPLE RESOLUTION
// ============================================

/**
 * Searches working folder recursively for missing WAV files
 * 
 * @param {Array<string>} sampleNames - WAV names to search for
 * @returns {Promise<Array<File>>}
 */
async function searchWorkingFolderForSamples(sampleNames) {
    if (!window.workingFolderHandle || !sampleNames || sampleNames.length === 0) {
        return [];
    }

    const lowerTargets = new Set(sampleNames.map(name => name.toLowerCase()));
    const foundFiles = [];

    async function searchDirectory(dirHandle) {
        for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind === 'file') {
                const lower = name.toLowerCase();
                if (lowerTargets.has(lower)) {
                    try {
                        const file = await handle.getFile();
                        foundFiles.push(file);
                    } catch (error) {
                        console.warn('Failed to read working folder file:', name, error);
                    }
                }
            } else if (handle.kind === 'directory') {
                await searchDirectory(handle);
            }

            if (foundFiles.length === sampleNames.length) {
                return;
            }
        }
    }

    try {
        await searchDirectory(window.workingFolderHandle);
    } catch (error) {
        console.warn('Working folder search failed:', error);
    }

    return foundFiles;
}

/**
 * Resolves missing samples for an SFZ or preset import
 * 
 * @param {Object} sfzData - Parsed SFZ data
 * @param {Array} foundWavFiles - WAV files already found in the package
 * @returns {Promise<{wavFiles:Array,cancelled:boolean}>}
 */
async function handleMissingSamples(sfzData, foundWavFiles = []) {
    const requiredSamples = new Map();

    (sfzData.regions || []).forEach(region => {
        const sampleName = (region.sample || region.wavFile?.name || '').split(/[/\\]/).pop();
        if (sampleName) {
            requiredSamples.set(sampleName.toLowerCase(), sampleName);
        }
    });

    const foundNames = new Set(foundWavFiles.map(w => w.name.toLowerCase()));
    const missingSamples = Array.from(requiredSamples.entries())
        .filter(([lower]) => !foundNames.has(lower))
        .map(([, original]) => original);

    if (missingSamples.length === 0) {
        return { wavFiles: foundWavFiles, cancelled: false };
    }

    const locatedFiles = await searchWorkingFolderForSamples(missingSamples);
    const locatedNames = new Set(locatedFiles.map(f => f.name.toLowerCase()));
    const stillMissing = missingSamples.filter(name => !locatedNames.has(name.toLowerCase()));

    if (stillMissing.length === 0) {
        return { wavFiles: [...foundWavFiles, ...locatedFiles], cancelled: false };
    }

    if (locatedFiles.length > 0) {
        const proceed = await promptSomeMissing(stillMissing, foundWavFiles.length + locatedFiles.length, requiredSamples.size);
        if (!proceed) {
            return { wavFiles: [...foundWavFiles, ...locatedFiles], cancelled: false };
        }
    }

    const userFiles = await promptUserToLocateSamples(stillMissing);
    if (!userFiles) {
        return { wavFiles: [...foundWavFiles, ...locatedFiles], cancelled: true };
    }

    return {
        wavFiles: [...foundWavFiles, ...locatedFiles, ...userFiles],
        cancelled: false
    };
}

/**
 * Attempts to auto-load samples referenced by current preset from the working folder.
 */
async function autoLoadReferencedSamples() {
    const { presetData, assetCells } = window.BitboxerData;
    if (!presetData) return;

    const needed = new Set();

    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            const pad = presetData.pads?.[row]?.[col];
            if (!pad?.filename) continue;
            const leaf = pad.filename.split(/[/\\]/).pop();
            if (leaf && /\.wav$/i.test(leaf)) {
                needed.add(leaf);
            }
        }
    }

    (assetCells || []).forEach(asset => {
        const leaf = (asset.filename || '').split(/[/\\]/).pop();
        if (leaf && /\.wav$/i.test(leaf)) {
            needed.add(leaf);
        }
    });

    if (needed.size === 0) return;

    const foundFiles = await searchWorkingFolderForSamples(Array.from(needed));
    if (foundFiles.length === 0) return;

    if (!window._lastImportedFiles) {
        window._lastImportedFiles = new Map();
    }

    foundFiles.forEach(file => {
        window._lastImportedFiles.set(file.name, file);
    });
}

/**
 * Prompts user to choose sample files for a list of missing sample names.
 * 
 * @param {Array<string>} missingSamples
 * @returns {Promise<Array<File>|null>}
 */
async function promptUserToLocateSamples(missingSamples) {
    if (!missingSamples || missingSamples.length === 0) return [];

    const supportsPicker = typeof window.showOpenFilePicker === 'function';
    if (!supportsPicker) {
        const fallback = document.createElement('input');
        fallback.type = 'file';
        fallback.accept = '.wav,.WAV';
        fallback.multiple = true;

        return new Promise(resolve => {
            fallback.onchange = () => resolve(Array.from(fallback.files || []));
            fallback.click();
        });
    }

    try {
        const handles = await window.showOpenFilePicker({
            multiple: true,
            types: [{
                description: 'WAV files',
                accept: { 'audio/wav': ['.wav', '.WAV'] }
            }]
        });

        const files = [];
        for (const handle of handles) {
            files.push(await handle.getFile());
        }
        return files;
    } catch (error) {
        if (error?.name === 'AbortError') {
            return null;
        }
        throw error;
    }
}

/**
 * Assigns imported WAV files to pads sequentially
 * 
 * @param {Array<Object>} wavFiles - WAV file descriptors from FileHandler
 */
function assignWAVsToPads(wavFiles) {
    const { presetData } = window.BitboxerData;
    let assigned = 0;

    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            if (assigned >= wavFiles.length) break;
            const pad = presetData.pads[row][col];
            const wav = wavFiles[assigned];

            pad.filename = wav.name;
            pad.type = 'sample';
            assigned++;
        }
    }

    window.BitboxerUI.updatePadDisplay();
    window.BitboxerUtils.setStatus(`Assigned ${assigned} WAV file(s)`, 'success');
}

// ============================================
// PROMPTS / UI HELPERS
// ============================================

async function promptAllMissing(missingSamples) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.style.zIndex = '3000';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2>Missing Samples</h2>
                </div>
                <div style="padding: 20px;">
                    <p style="margin-bottom: 15px;">The following samples are missing:</p>
                    <div style="max-height: 200px; overflow-y: auto; background: var(--color-bg-primary); padding: 10px; border-radius: var(--radius-md); margin-bottom: 15px; font-family: monospace; font-size: 0.85em;">
                        ${missingSamples.map(name => `<div>• ${name}</div>`).join('')}
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-primary" id="locateBtn2" style="flex: 1;">Locate Samples</button>
                        <button class="btn" id="cancelBtn2" style="flex: 1;">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('locateBtn2').onclick = () => {
            document.body.removeChild(modal);
            resolve(true);
        };

        document.getElementById('cancelBtn2').onclick = () => {
            document.body.removeChild(modal);
            resolve(false);
        };
    });
}

/**
 * Prompts when some samples are missing
 * 
 * @param {Array} missingSamples - Array of missing sample names
 * @param {number} foundCount - Number of samples found
 * @param {number} totalCount - Total number of samples needed
 * @returns {Promise<boolean>} True if user wants to locate missing samples
 */
async function promptSomeMissing(missingSamples, foundCount, totalCount) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.style.zIndex = '3000';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2>⚠️ Some Samples Missing</h2>
                </div>
                <div style="padding: 20px;">
                    <p style="margin-bottom: 15px;">
                        Found: <strong>${foundCount}/${totalCount}</strong> | 
                        Missing: <strong>${missingSamples.length}</strong>
                    </p>
                    ${missingSamples.length <= 10 ? `
                        <div style="max-height: 200px; overflow-y: auto; background: var(--color-bg-primary); padding: 10px; border-radius: var(--radius-md); margin-bottom: 15px; font-family: monospace; font-size: 0.85em;">
                            ${missingSamples.map(name => `<div>• ${name}</div>`).join('')}
                        </div>
                    ` : ''}
                    <p style="margin-bottom: 20px; color: var(--color-text-secondary);">
                        Locate missing samples?
                    </p>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-primary" id="locateBtn3" style="flex: 1;">📁 Locate Missing</button>
                        <button class="btn" id="skipBtn3" style="flex: 1;">Continue Without</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        document.getElementById('locateBtn3').onclick = () => {
            document.body.removeChild(modal);
            resolve(true);
        };
        
        document.getElementById('skipBtn3').onclick = () => {
            document.body.removeChild(modal);
            resolve(false);
        };
    });
}

/**
 * Prompts user to choose replace or merge for preset import
 * 
 * @returns {Promise<string>} 'replace', 'merge', or 'cancel'
 */
async function promptLoadOrMerge() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.style.zIndex = '3000';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Load Preset</h2>
                </div>
                <div style="padding: 20px;">
                    <p style="margin-bottom: 20px;">How to load?</p>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button class="btn btn-primary" id="replaceBtn" style="padding: 15px;">
                            <strong>Replace All Pads</strong><br>
                            <small style="opacity: 0.8;">Clear current project</small>
                        </button>
                        <button class="btn btn-primary" id="mergeBtn" style="padding: 15px;">
                            <strong>Merge Into Project</strong><br>
                            <small style="opacity: 0.8;">Import to empty slots</small>
                        </button>
                        <button class="btn" id="cancelBtn">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        document.getElementById('replaceBtn').onclick = () => {
            document.body.removeChild(modal);
            resolve('replace');
        };
        
        document.getElementById('mergeBtn').onclick = () => {
            document.body.removeChild(modal);
            resolve('merge');
        };
        
        document.getElementById('cancelBtn').onclick = () => {
            document.body.removeChild(modal);
            resolve('cancel');
        };
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                resolve('cancel');
            }
        };
    });
}

// ============================================
// PRESET MERGING
// ============================================

/**
 * Merges preset into current project
 * Prompts user to map imported pads to slots
 * 
 * @param {File} file - XML preset file
 */
async function mergePreset(file) {
    try {
        const text = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');
        
        const cells = xmlDoc.querySelectorAll('cell[layer="0"]');
        const importedPads = [];
        
        cells.forEach(cell => {
            const row = parseInt(cell.getAttribute('row'));
            const col = parseInt(cell.getAttribute('column'));
            const filename = cell.getAttribute('filename') || '';
            
            if (!isNaN(row) && !isNaN(col) && filename) {
                const padData = {
                    row, col, filename,
                    type: cell.getAttribute('type'),
                    params: {},
                    modsources: [],
                    slices: []
                };
                
                const params = cell.querySelector('params');
                if (params) {
                    Array.from(params.attributes).forEach(attr => {
                        padData.params[attr.name] = attr.value;
                    });
                }
                
                cell.querySelectorAll('modsource').forEach(mod => {
                    const modSource = {
                        dest: mod.getAttribute('dest'),
                        src: mod.getAttribute('src'),
                        slot: mod.getAttribute('slot'),
                        amount: mod.getAttribute('amount')
                    };
                    const mchan = mod.getAttribute('mchan');
                    const ccnum = mod.getAttribute('ccnum');
                    if (mchan !== null) modSource.mchan = mchan;
                    if (ccnum !== null) modSource.ccnum = ccnum;
                    padData.modsources.push(modSource);
                });
                
                const slicesNode = cell.querySelector('slices');
                if (slicesNode) {
                    slicesNode.querySelectorAll('slice').forEach(slice => {
                        padData.slices.push({ pos: slice.getAttribute('pos') });
                    });
                }
                
                importedPads.push(padData);
            }
        });
        
        if (importedPads.length === 0) {
            window.BitboxerUtils.setStatus('No pads in preset', 'error');
            return;
        }
        
        const { presetData } = window.BitboxerData;
        const emptySlots = [];
        const occupiedSlots = [];
        
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const pad = presetData.pads[row][col];
                if (!pad.filename || pad.filename === '') {
                    emptySlots.push({ row, col });
                } else {
                    occupiedSlots.push({ row, col });
                }
            }
        }
        
        const mappings = await promptPadMapping(importedPads, emptySlots, occupiedSlots);
        
        if (!mappings || mappings.length === 0) {
            window.BitboxerUtils.setStatus('Merge cancelled', 'info');
            return;
        }
        
        mappings.forEach(mapping => {
            const { source, target } = mapping;
            presetData.pads[target.row][target.col] = {
                filename: source.filename,
                type: source.type,
                params: { ...source.params },
                modsources: JSON.parse(JSON.stringify(source.modsources)),
                slices: JSON.parse(JSON.stringify(source.slices))
            };
        });
        
        const assetNodes = xmlDoc.querySelectorAll('cell[type="asset"]');
        assetNodes.forEach((asset) => {
            const params = asset.querySelector('params');
            if (params) {
                window.BitboxerData.assetCells.push({
                    row: window.BitboxerData.assetCells.length,
                    filename: asset.getAttribute('filename') || '',
                    params: {
                        rootnote: params.getAttribute('rootnote') || '60',
                        keyrangebottom: params.getAttribute('keyrangebottom') || '0',
                        keyrangetop: params.getAttribute('keyrangetop') || '127',
                        velroot: params.getAttribute('velroot') || '64',
                        velrangebottom: params.getAttribute('velrangebottom') || '0',
                        velrangetop: params.getAttribute('velrangetop') || '127',
                        asssrcrow: params.getAttribute('asssrcrow') || '0',
                        asssrccol: params.getAttribute('asssrccol') || '0'
                    }
                });
            }
        });
        
        window.BitboxerUI.updatePadDisplay();
        window.BitboxerUtils.setStatus(`Merged ${mappings.length} pad(s)`, 'success');
    } catch (error) {
        console.error('Merge error:', error);
        window.BitboxerUtils.setStatus(`Merge failed: ${error.message}`, 'error');
    }
}

/**
 * Prompts user to map imported pads to target slots
 * 
 * @param {Array} importedPads - Pads to import
 * @param {Array} emptySlots - Available empty slots
 * @param {Array} occupiedSlots - Occupied slots
 * @returns {Promise<Array|null>} Mappings or null if cancelled
 */
async function promptPadMapping(importedPads, emptySlots, occupiedSlots) {
    return new Promise((resolve) => {
        const allSlots = [...emptySlots, ...occupiedSlots].sort((a, b) => {
            if (a.row !== b.row) return a.row - b.row;
            return a.col - b.col;
        });
        
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.style.zIndex = '3000';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>Map Imported Pads</h2>
                </div>
                <div style="padding: 20px;">
                    <p style="margin-bottom: 15px;">Select pads to import and where to place:</p>
                    <div id="padMappingContainer" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;"></div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-primary" id="importMappedBtn" style="flex: 1;">Import Selected</button>
                        <button class="btn" id="cancelMappingBtn" style="flex: 1;">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const container = document.getElementById('padMappingContainer');
        const { presetData } = window.BitboxerData;
        const selectedDestinations = new Set();
        
        importedPads.forEach((pad, idx) => {
            const sourcePadNum = (pad.row * 4) + pad.col + 1;
            const sourceName = pad.filename ? 
                pad.filename.split(/[/\\]/).pop().replace(/\.(wav|WAV)$/, '') : 
                'Empty';
            
            container.innerHTML += `
                <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center; padding: 10px; background: var(--color-bg-tertiary); border-radius: var(--radius-md);">
                    <div style="color: var(--color-accent-blue); font-weight: 600;">Pad ${sourcePadNum}: ${sourceName}</div>
                    <div style="color: var(--color-text-secondary);">→</div>
                    <select class="select mapping-target" data-source-idx="${idx}" style="width: 100%;"></select>
                </div>
            `;
        });
        
        const targetSelects = container.querySelectorAll('.mapping-target');
        
        function updateAllOptions() {
            targetSelects.forEach((select, idx) => {
                const currentValue = select.value;
                let options = '<option value="">-- Don\'t Import --</option>';
                
                emptySlots.forEach(slot => {
                    const slotKey = `${slot.row},${slot.col}`;
                    const targetPadNum = (slot.row * 4) + slot.col + 1;
                    const isSelected = selectedDestinations.has(slotKey) && currentValue !== slotKey;
                    if (!isSelected) {
                        options += `<option value="${slotKey}" ${currentValue === slotKey ? 'selected' : ''}>Pad ${targetPadNum} (Empty)</option>`;
                    }
                });
                
                occupiedSlots.forEach(slot => {
                    const slotKey = `${slot.row},${slot.col}`;
                    const targetPadNum = (slot.row * 4) + slot.col + 1;
                    const targetPad = presetData.pads[slot.row][slot.col];
                    const targetName = targetPad.filename ? 
                        targetPad.filename.split(/[/\\]/).pop().replace(/\.(wav|WAV)$/, '') : 
                        'Sample';
                    const isSelected = selectedDestinations.has(slotKey) && currentValue !== slotKey;
                    if (!isSelected) {
                        options += `<option value="${slotKey}" ${currentValue === slotKey ? 'selected' : ''}>Pad ${targetPadNum} (${targetName}) ⚠️</option>`;
                    }
                });
                
                select.innerHTML = options;
            });
        }
        
        updateAllOptions();
        
        targetSelects.forEach((select, idx) => {
            if (idx < emptySlots.length) {
                const slotKey = `${emptySlots[idx].row},${emptySlots[idx].col}`;
                select.value = slotKey;
                selectedDestinations.add(slotKey);
            }
        });
        
        updateAllOptions();
        
        targetSelects.forEach(select => {
            select.addEventListener('change', () => {
                selectedDestinations.clear();
                targetSelects.forEach(s => {
                    if (s.value) selectedDestinations.add(s.value);
                });
                updateAllOptions();
            });
        });
        
        document.getElementById('importMappedBtn').onclick = () => {
            const mappings = [];
            targetSelects.forEach((select, idx) => {
                if (select.value) {
                    const [row, col] = select.value.split(',').map(Number);
                    mappings.push({
                        source: importedPads[idx],
                        target: { row, col }
                    });
                }
            });
            
            if (mappings.length === 0) {
                window.BitboxerUtils.setStatus('No pads selected', 'error');
                return;
            }
            
            document.body.removeChild(modal);
            resolve(mappings);
        };
        
        document.getElementById('cancelMappingBtn').onclick = () => {
            document.body.removeChild(modal);
            resolve(null);
        };
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                resolve(null);
            }
        };
    });
}

// ============================================
// PAD LOADING HELPERS
// ============================================

/**
 * Loads pad from JSON export file
 * 
 * @param {File} file - JSON file
 * @param {HTMLElement} targetPad - Target pad element
 */
async function loadPadFromJSON(file, targetPad) {
    try {
        const text = await file.text();
        const padData = JSON.parse(text);
        
        const row = parseInt(targetPad.dataset.row);
        const col = parseInt(targetPad.dataset.col);
        
        if (padData.data) {
            window.BitboxerData.presetData.pads[row][col] = JSON.parse(JSON.stringify(padData.data));
            window.BitboxerUI.updatePadDisplay();
            await refreshPadEditorIfOpen(targetPad);
            window.BitboxerUtils.setStatus(`Loaded from ${file.name}`, 'success');
        } else {
            window.BitboxerUtils.setStatus('Invalid pad JSON', 'error');
        }
    } catch (error) {
        window.BitboxerUtils.setStatus(`Error loading: ${error.message}`, 'error');
    }
}

/**
 * Loads pad from self-contained ZIP export
 * 
 * @param {File} zipFile - ZIP file
 * @param {HTMLElement} targetPad - Target pad element
 */
async function loadPadFromZIP(zipFile, targetPad) {
    try {
        window.BitboxerUtils.setStatus('Loading pad ZIP...', 'info');
        const result = await window.BitboxerFileHandler.FileImporter.import(zipFile);
        
        const jsonFiles = Array.from(result.collection.files.entries())
            .filter(([path, file]) => path.endsWith('.json'));
        
        if (jsonFiles.length === 0) {
            window.BitboxerUtils.setStatus('No pad JSON in ZIP', 'error');
            return;
        }
        
        const [jsonPath, jsonFile] = jsonFiles[0];
        const text = await jsonFile.text();
        const padData = JSON.parse(text);
        
        const row = parseInt(targetPad.dataset.row);
        const col = parseInt(targetPad.dataset.col);
        
        if (padData.data) {
            window._lastImportedFiles = new Map();
            cacheFilesBySimpleName(result.collection.files);
            
            window.BitboxerData.presetData.pads[row][col] = JSON.parse(JSON.stringify(padData.data));
            
            if (padData.assetReferences) {
                window.BitboxerData.assetCells = window.BitboxerData.assetCells.filter(asset =>
                    !(parseInt(asset.params.asssrcrow) === row &&
                        parseInt(asset.params.asssrccol) === col)
                );
                
                padData.assetReferences.forEach(asset => {
                    window.BitboxerData.assetCells.push({
                        ...asset,
                        params: {
                            ...asset.params,
                            asssrcrow: row.toString(),
                            asssrccol: col.toString()
                        }
                    });
                });
            }
            
            window.BitboxerUI.updatePadDisplay();
            await refreshPadEditorIfOpen(targetPad);
            window.BitboxerUtils.setStatus(`Loaded from ${zipFile.name}`, 'success');
        } else {
            window.BitboxerUtils.setStatus('Invalid pad ZIP', 'error');
        }
    } catch (error) {
        console.error('Pad ZIP error:', error);
        window.BitboxerUtils.setStatus(`Error: ${error.message}`, 'error');
    }
}

// ============================================
// EXPORT IMPORT HANDLER
// ============================================
window.BitboxerImport = {
    unifiedImportHandler,
    processImportedFiles,
    loadPadFromJSON,
    loadPadFromZIP,
    autoLoadReferencedSamples,
    addWavToMultisamplePad
};
