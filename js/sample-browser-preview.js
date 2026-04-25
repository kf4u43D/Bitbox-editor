(function () {
    class SampleBrowserPreviewController {
        constructor() {
            this.modal = null;
            this.selectedPad = null;
            this.multisampleAssignment = null;
            this.browserMode = 'pad';
            this.browserTitle = 'Sample Browser';
            this.importButtonLabel = 'Import To Pad';
            this.allowedExtensions = ['.wav', '.sfz', '.zip', '.json'];
            this.workingFolderHandle = null;
            this.fileIndex = [];
            this.directoryIndex = [];
            this.filteredIndex = [];
            this.selectedIndex = -1;
            this.selectedRelativePath = '';
            this.currentDirectory = '';
            this.autoPreviewEnabled = true;
            this.extensionFilter = 'all';
            this.searchQuery = '';
            this.audioContext = null;
            this.activeSource = null;
            this.previewGain = 0.45;
            this.lastPreviewedPath = null;
            this.indexPromise = null;
            this.metadataCache = new Map();
            this.previewTargetCache = new Map();
            this.thumbnailCache = new Map();
            this.thumbnailPromiseCache = new Map();
            this.thumbnailFrame = null;
            this.scanStats = { directories: 0, files: 0, skippedDirectories: 0 };
            this.boundKeydown = (event) => this.handleKeydown(event);
            this.storageKeys = {
                autoPreview: 'bitboxer.sampleBrowser.autoPreview',
                extensionFilter: 'bitboxer.sampleBrowser.extensionFilter',
                searchQuery: 'bitboxer.sampleBrowser.searchQuery',
                currentDirectory: 'bitboxer.sampleBrowser.currentDirectory'
            };
        }

        getFolderSelectionKey() {
            const folderName = this.workingFolderHandle?.name || 'default';
            return `bitboxer.sampleBrowser.lastSelection.${this.browserMode}.${folderName}`;
        }

        getAvailableFilters() {
            return ['all', ...this.allowedExtensions];
        }

        normalizeMultisampleAssignment(assignment = {}) {
            const rootNote = Math.max(0, Math.min(127, parseInt(assignment.rootNote ?? 60, 10) || 60));
            const keyRangeBottom = Math.max(0, Math.min(127, parseInt(assignment.keyRangeBottom ?? rootNote, 10) || rootNote));
            const keyRangeTop = Math.max(keyRangeBottom, Math.min(127, parseInt(assignment.keyRangeTop ?? rootNote, 10) || rootNote));
            const velRangeBottom = Math.max(0, Math.min(127, parseInt(assignment.velRangeBottom ?? 0, 10) || 0));
            const velRangeTop = Math.max(velRangeBottom, Math.min(127, parseInt(assignment.velRangeTop ?? 127, 10) || 127));
            return {
                rootNote,
                keyRangeBottom,
                keyRangeTop,
                velRangeBottom,
                velRangeTop
            };
        }

        configureBrowser(options = {}) {
            const {
                mode = 'pad',
                targetPad = null,
                multisampleAssignment = null
            } = options;

            this.browserMode = mode;
            this.selectedPad = targetPad;
            this.multisampleAssignment = multisampleAssignment;

            if (mode === 'preset') {
                this.browserTitle = 'Preset Browser';
                this.importButtonLabel = 'Load Preset';
                this.allowedExtensions = ['.xml', '.zip'];
            } else if (mode === 'multisample') {
                this.browserTitle = 'Add Multisample Layer';
                this.importButtonLabel = 'Add Layer';
                this.allowedExtensions = ['.wav'];
                this.multisampleAssignment = this.normalizeMultisampleAssignment(multisampleAssignment || {});
            } else {
                this.browserTitle = 'Sample Browser';
                this.importButtonLabel = 'Import To Pad';
                this.allowedExtensions = ['.wav', '.sfz', '.zip', '.json'];
            }
        }

        loadPreferences() {
            try {
                const autoPreview = localStorage.getItem(this.storageKeys.autoPreview);
                const extensionFilter = localStorage.getItem(this.storageKeys.extensionFilter);
                const searchQuery = localStorage.getItem(this.storageKeys.searchQuery);
                const currentDirectory = localStorage.getItem(this.storageKeys.currentDirectory);
                const lastSelection = localStorage.getItem(this.getFolderSelectionKey());

                this.autoPreviewEnabled = autoPreview !== 'false';
                this.extensionFilter = extensionFilter || 'all';
                this.searchQuery = searchQuery || '';
                this.currentDirectory = currentDirectory || '';
                this.selectedRelativePath = lastSelection || '';
            } catch {
                this.autoPreviewEnabled = true;
                this.extensionFilter = 'all';
                this.searchQuery = '';
                this.currentDirectory = '';
                this.selectedRelativePath = '';
            }
        }

        persistPreferences() {
            try {
                localStorage.setItem(this.storageKeys.autoPreview, String(this.autoPreviewEnabled));
                localStorage.setItem(this.storageKeys.extensionFilter, this.extensionFilter);
                localStorage.setItem(this.storageKeys.searchQuery, this.searchQuery);
                localStorage.setItem(this.storageKeys.currentDirectory, this.currentDirectory || '');
            } catch {
                // no-op
            }
        }

        persistSelection() {
            try {
                localStorage.setItem(this.getFolderSelectionKey(), this.selectedRelativePath || '');
            } catch {
                // no-op
            }
        }

        buildWaveformPeaks(audioBuffer, bins = 56) {
            const channelData = audioBuffer.getChannelData(0);
            const length = channelData.length;
            if (!length) {
                return [];
            }

            const peaks = [];
            const samplesPerBin = Math.max(1, Math.floor(length / bins));

            for (let bin = 0; bin < bins; bin++) {
                const start = bin * samplesPerBin;
                const end = bin === bins - 1 ? length : Math.min(length, start + samplesPerBin);
                const stride = Math.max(1, Math.floor((end - start) / 48));
                let peak = 0;

                for (let index = start; index < end; index += stride) {
                    peak = Math.max(peak, Math.abs(channelData[index]));
                }

                peaks.push(Math.min(1, peak));
            }

            return peaks;
        }

        buildWaveformThumbnailMarkup(peaks) {
            if (!peaks.length) {
                return '';
            }

            const width = 120;
            const height = 46;
            const mid = height / 2;
            const step = width / peaks.length;
            const path = peaks.map((peak, index) => {
                const x = (index * step) + (step / 2);
                const amplitude = Math.max(2, peak * (height * 0.42));
                const top = Math.max(2, mid - amplitude);
                const bottom = Math.min(height - 2, mid + amplitude);
                return `M${x.toFixed(2)} ${top.toFixed(2)}L${x.toFixed(2)} ${bottom.toFixed(2)}`;
            }).join(' ');

            return `
                <svg class="sample-browser-thumb-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
                    <line class="sample-browser-thumb-center" x1="0" y1="${mid}" x2="${width}" y2="${mid}"></line>
                    <path class="sample-browser-thumb-wave" d="${path}"></path>
                </svg>
            `;
        }

        async getThumbnailMarkup(fileEntry) {
            if (!fileEntry) {
                return null;
            }

            if (this.thumbnailCache.has(fileEntry.relativePath)) {
                return this.thumbnailCache.get(fileEntry.relativePath);
            }

            if (this.thumbnailPromiseCache.has(fileEntry.relativePath)) {
                return this.thumbnailPromiseCache.get(fileEntry.relativePath);
            }

            const promise = (async () => {
                try {
                    const previewTarget = await this.resolvePreviewTarget(fileEntry);
                    if (!previewTarget || previewTarget.ext !== '.wav') {
                        this.thumbnailCache.set(fileEntry.relativePath, null);
                        return null;
                    }

                    const file = await previewTarget.handle.getFile();
                    const arrayBuffer = await file.arrayBuffer();
                    const context = await this.ensureContext();
                    const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
                    const markup = this.buildWaveformThumbnailMarkup(this.buildWaveformPeaks(audioBuffer));
                    this.thumbnailCache.set(fileEntry.relativePath, markup || null);
                    return markup || null;
                } catch (error) {
                    console.warn('Waveform thumbnail generation failed:', error);
                    this.thumbnailCache.set(fileEntry.relativePath, null);
                    return null;
                } finally {
                    this.thumbnailPromiseCache.delete(fileEntry.relativePath);
                }
            })();

            this.thumbnailPromiseCache.set(fileEntry.relativePath, promise);
            return promise;
        }

        updateThumbnailNode(thumbId, markup, canPreview) {
            if (!this.modal) {
                return;
            }

            this.modal.querySelectorAll('.sample-browser-thumb').forEach((node) => {
                if (node.dataset.thumbId !== thumbId) {
                    return;
                }

                node.classList.remove('is-loading');
                node.classList.toggle('is-ready', Boolean(markup));
                node.classList.toggle('is-unavailable', !markup && !canPreview);
                if (markup) {
                    node.innerHTML = markup;
                }
            });
        }

        scheduleThumbnailHydration() {
            if (!this.modal) {
                return;
            }

            if (this.thumbnailFrame) {
                cancelAnimationFrame(this.thumbnailFrame);
            }

            this.thumbnailFrame = requestAnimationFrame(() => {
                this.thumbnailFrame = null;
                this.hydrateVisibleThumbnails();
            });
        }

        async hydrateVisibleThumbnails() {
            const list = this.modal?.querySelector('#sampleBrowserList');
            if (!list) {
                return;
            }

            const listRect = list.getBoundingClientRect();
            const placeholders = Array.from(list.querySelectorAll('.sample-browser-thumb.is-audio')).filter((node) => {
                if (node.classList.contains('is-ready')) {
                    return false;
                }

                const rect = node.getBoundingClientRect();
                return rect.bottom >= listRect.top - 72 && rect.top <= listRect.bottom + 72;
            }).slice(0, 18);

            for (const node of placeholders) {
                const index = parseInt(node.dataset.index ?? '-1', 10);
                const fileEntry = this.filteredIndex[index];
                if (!fileEntry) {
                    continue;
                }

                node.classList.add('is-loading');
                const markup = await this.getThumbnailMarkup(fileEntry);
                const canPreview = Boolean(await this.resolvePreviewTarget(fileEntry));
                this.updateThumbnailNode(node.dataset.thumbId, markup, canPreview);
            }
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

        async ensureWorkingFolderAccess() {
            if (!this.workingFolderHandle) {
                return false;
            }

            try {
                const permission = typeof this.workingFolderHandle.queryPermission === 'function'
                    ? await this.workingFolderHandle.queryPermission({ mode: 'read' })
                    : 'prompt';

                if (permission === 'granted') {
                    return true;
                }

                if (typeof this.workingFolderHandle.requestPermission === 'function') {
                    const requested = await this.workingFolderHandle.requestPermission({ mode: 'read' });
                    return requested === 'granted';
                }

                return false;
            } catch (error) {
                console.error('Working folder permission check failed:', error);
                return false;
            }
        }

        stopPreview() {
            if (this.activeSource) {
                try {
                    this.activeSource.onended = null;
                    this.activeSource.stop();
                } catch {
                    // no-op
                }
            }

            this.activeSource = null;
            this.lastPreviewedPath = null;
            const previewButton = this.modal?.querySelector('#sampleBrowserPreviewBtn');
            if (previewButton) {
                previewButton.textContent = 'Preview';
            }
            this.renderList();
        }

        async resolvePreviewTarget(fileEntry) {
            if (!fileEntry) return null;

            if (fileEntry.ext === '.wav') {
                return fileEntry;
            }

            if (fileEntry.ext !== '.sfz') {
                return null;
            }

            if (this.previewTargetCache.has(fileEntry.relativePath)) {
                return this.previewTargetCache.get(fileEntry.relativePath);
            }

            try {
                const sfzFile = await fileEntry.handle.getFile();
                const text = await sfzFile.text();
                const parsed = window.BitboxerFileHandler?.SFZParser?.parse(text);
                const samplePath = parsed?.regions?.find((region) => region.sample)?.sample;
                if (!samplePath) {
                    this.previewTargetCache.set(fileEntry.relativePath, null);
                    return null;
                }

                const normalizedSample = samplePath.replace(/\\/g, '/').toLowerCase();
                const sampleName = normalizedSample.split('/').pop();

                const match = this.fileIndex.find((entry) => {
                    if (entry.ext !== '.wav') return false;
                    const entryPath = entry.relativePath.toLowerCase();
                    return entryPath === normalizedSample ||
                        entryPath.endsWith(`/${normalizedSample}`) ||
                        entry.name.toLowerCase() === sampleName;
                }) ?? null;

                this.previewTargetCache.set(fileEntry.relativePath, match);
                return match;
            } catch (error) {
                console.warn('SFZ preview target resolution failed:', error);
                this.previewTargetCache.set(fileEntry.relativePath, null);
                return null;
            }
        }

        async previewFile(fileEntry) {
            const previewTarget = await this.resolvePreviewTarget(fileEntry);
            if (!previewTarget || previewTarget.ext !== '.wav') {
                return;
            }

            if (this.lastPreviewedPath === fileEntry.relativePath && this.activeSource) {
                this.stopPreview();
                return;
            }

            const file = await previewTarget.handle.getFile();
            const arrayBuffer = await file.arrayBuffer();
            const context = await this.ensureContext();
            const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));

            this.stopPreview();

            const source = context.createBufferSource();
            const gainNode = context.createGain();
            source.buffer = audioBuffer;
            gainNode.gain.value = this.previewGain;
            source.connect(gainNode);
            gainNode.connect(context.destination);

            source.onended = () => {
                if (this.activeSource === source) {
                    this.activeSource = null;
                    this.lastPreviewedPath = null;
                    const previewButton = this.modal?.querySelector('#sampleBrowserPreviewBtn');
                    if (previewButton) {
                        previewButton.textContent = 'Preview';
                    }
                    this.renderList();
                }
            };

            this.activeSource = source;
            this.lastPreviewedPath = fileEntry.relativePath;
            const previewButton = this.modal?.querySelector('#sampleBrowserPreviewBtn');
            if (previewButton) {
                previewButton.textContent = 'Stop';
            }

            source.start();
            this.renderList();
        }

        async loadMetadata(fileEntry) {
            if (!fileEntry) {
                return null;
            }

            if (this.metadataCache.has(fileEntry.relativePath)) {
                return this.metadataCache.get(fileEntry.relativePath);
            }

            const file = await fileEntry.handle.getFile();
            if (fileEntry.ext !== '.wav') {
                const metadata = {
                    type: fileEntry.ext.replace('.', '').toUpperCase(),
                    size: file.size
                };
                this.metadataCache.set(fileEntry.relativePath, metadata);
                return metadata;
            }

            try {
                const arrayBuffer = await file.arrayBuffer();
                const metadata = window.BitboxerFileHandler.WAVParser.parseMetadata(arrayBuffer);
                const normalized = {
                    type: 'WAV',
                    size: file.size,
                    duration: metadata.duration ?? null,
                    sampleRate: metadata.sampleRate ?? null,
                    channels: metadata.channels ?? metadata.numChannels ?? null,
                    bitDepth: metadata.bitDepth ?? metadata.bitsPerSample ?? null
                };
                this.metadataCache.set(fileEntry.relativePath, normalized);
                return normalized;
            } catch {
                const fallback = {
                    type: 'WAV',
                    size: file.size
                };
                this.metadataCache.set(fileEntry.relativePath, fallback);
                return fallback;
            }
        }

        formatDuration(seconds) {
            if (!seconds || Number.isNaN(seconds)) return '--';
            return `${seconds.toFixed(2)} s`;
        }

        formatFileSize(bytes) {
            if (!bytes && bytes !== 0) return '--';
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        }

        getParentRelativePath(relativePath = '') {
            if (!relativePath || !relativePath.includes('/')) {
                return '';
            }

            return relativePath.split('/').slice(0, -1).join('/');
        }

        buildDirectoryIndex(entries) {
            const directories = new Map();

            directories.set('', {
                kind: 'directory',
                name: this.workingFolderHandle?.name || 'Root',
                relativePath: '',
                parentRelativePath: '',
                searchText: ''
            });

            entries.forEach((entry) => {
                const parts = entry.relativePath.split('/');
                let currentPath = '';

                for (let index = 0; index < parts.length - 1; index += 1) {
                    currentPath = currentPath ? `${currentPath}/${parts[index]}` : parts[index];
                    if (!directories.has(currentPath)) {
                        directories.set(currentPath, {
                            kind: 'directory',
                            name: parts[index],
                            relativePath: currentPath,
                            parentRelativePath: this.getParentRelativePath(currentPath),
                            searchText: currentPath.toLowerCase()
                        });
                    }
                }
            });

            this.directoryIndex = Array.from(directories.values())
                .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
        }

        getDirectoryFileCount(relativePath) {
            return this.fileIndex.filter((entry) => entry.parentRelativePath === relativePath).length;
        }

        getDirectorySubdirCount(relativePath) {
            return this.directoryIndex.filter((entry) =>
                entry.relativePath && entry.parentRelativePath === relativePath
            ).length;
        }

        updateBreadcrumbs() {
            const container = this.modal?.querySelector('#sampleBrowserBreadcrumbs');
            const upButton = this.modal?.querySelector('#sampleBrowserUpBtn');
            if (!container || !upButton) return;

            const segments = this.currentDirectory ? this.currentDirectory.split('/') : [];
            const crumbs = [{ label: this.workingFolderHandle?.name || 'Root', path: '' }];
            let currentPath = '';

            segments.forEach((segment) => {
                currentPath = currentPath ? `${currentPath}/${segment}` : segment;
                crumbs.push({ label: segment, path: currentPath });
            });

            container.innerHTML = crumbs.map((crumb, index) => `
                <button type="button" class="sample-browser-crumb${crumb.path === this.currentDirectory ? ' active' : ''}" data-path="${crumb.path}">${crumb.label}</button>${index < crumbs.length - 1 ? '<span class="sample-browser-crumb-sep">/</span>' : ''}
            `).join('');

            container.querySelectorAll('.sample-browser-crumb').forEach((button) => {
                button.addEventListener('click', () => {
                    this.navigateToDirectory(button.dataset.path || '', { clearSearch: true });
                });
            });

            upButton.disabled = !this.currentDirectory;
        }

        navigateToDirectory(relativePath = '', options = {}) {
            if (options.clearSearch) {
                this.searchQuery = '';
                const searchInput = this.modal?.querySelector('#sampleBrowserSearch');
                if (searchInput) {
                    searchInput.value = '';
                }
            }
            this.currentDirectory = relativePath;
            this.selectedIndex = -1;
            this.selectedRelativePath = '';
            this.persistPreferences();
            this.applyFilter();
        }

        async scanWorkingFolder(dirHandle) {
            const entries = [];
            this.scanStats = { directories: 0, files: 0, skippedDirectories: 0 };

            const walk = async (handle, prefix = '', depth = 0) => {
                if (depth > 6) return;

                let iterator;
                try {
                    iterator = handle.values();
                } catch (error) {
                    console.warn('Directory iterator unavailable:', error);
                    this.scanStats.skippedDirectories += 1;
                    return;
                }

                for await (const entry of iterator) {
                    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

                    if (entry.kind === 'directory') {
                        this.scanStats.directories += 1;
                        await walk(entry, relativePath, depth + 1);
                        continue;
                    }

                    const ext = `.${entry.name.split('.').pop().toLowerCase()}`;
                    if (!['.wav', '.sfz', '.zip', '.json', '.xml'].includes(ext)) {
                        continue;
                    }

                    this.scanStats.files += 1;

                    entries.push({
                        kind: 'file',
                        name: entry.name,
                        ext,
                        relativePath,
                        parentRelativePath: prefix,
                        searchText: relativePath.toLowerCase(),
                        handle: entry
                    });
                }
            };

            await walk(dirHandle);

            entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
            return entries;
        }

        async ensureIndex(dirHandle) {
            if (this.workingFolderHandle === dirHandle && this.fileIndex.length > 0) {
                return this.fileIndex;
            }

            if (this.indexPromise) {
                return this.indexPromise;
            }

            this.workingFolderHandle = dirHandle;
            this.previewTargetCache.clear();
            this.thumbnailCache.clear();
            this.thumbnailPromiseCache.clear();
            this.indexPromise = this.scanWorkingFolder(dirHandle)
                .then((entries) => {
                    this.fileIndex = entries;
                    this.buildDirectoryIndex(entries);
                    return entries;
                })
                .finally(() => {
                    this.indexPromise = null;
                });

            return this.indexPromise;
        }

        async chooseWorkingFolder() {
            if (!window.showDirectoryPicker) {
                window.BitboxerUtils?.setStatus('Sample browser requires Chrome or Edge for local folder access.', 'error');
                return false;
            }

            try {
                const dirHandle = await window.showDirectoryPicker({
                    mode: 'read'
                });

                if (window.BitboxerStartup?.storeFolderHandle) {
                    await window.BitboxerStartup.storeFolderHandle('workingFolder', dirHandle);
                }

                window.BitboxerData.workingFolderHandle = dirHandle;
                this.workingFolderHandle = dirHandle;
                this.fileIndex = [];
                this.directoryIndex = [];
                this.currentDirectory = '';
                this.selectedIndex = -1;
                this.selectedRelativePath = '';
                this.persistPreferences();

                const workingFolderBtn = document.getElementById('setWorkingFolderBtn');
                if (workingFolderBtn) {
                    workingFolderBtn.textContent = `📁 ${dirHandle.name}`;
                    workingFolderBtn.classList.remove('blink-warning');
                    workingFolderBtn.classList.add('active');
                }

                return true;
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Working folder selection failed:', error);
                }
                return false;
            }
        }

        closeModal() {
            this.stopPreview();
            if (this.thumbnailFrame) {
                cancelAnimationFrame(this.thumbnailFrame);
                this.thumbnailFrame = null;
            }
            if (this.modal) {
                this.modal.remove();
                this.modal = null;
            }
            document.removeEventListener('keydown', this.boundKeydown);
        }

        async refreshIndex() {
            if (!this.workingFolderHandle) {
                this.renderNoFolderState();
                this.setStatus('Choose a folder to browse', 'info');
                return;
            }
            this.setStatus('Indexing working folder...', 'info');
            this.fileIndex = [];
            this.directoryIndex = [];
            this.filteredIndex = [];
            this.selectedIndex = -1;
            this.metadataCache.clear();
            this.previewTargetCache.clear();
            this.thumbnailCache.clear();
            this.thumbnailPromiseCache.clear();
            const list = this.modal?.querySelector('#sampleBrowserList');
            if (list) {
                list.innerHTML = '<div class="sample-browser-empty">Loading files...</div>';
            }

            await this.ensureIndex(this.workingFolderHandle);
            this.applyFilter();
            this.setStatus(`${this.fileIndex.length} file(s) indexed`, 'success');
        }

        setStatus(message, type = '') {
            const status = this.modal?.querySelector('#sampleBrowserStatus');
            if (!status) return;
            status.textContent = message;
            status.className = `status-bar ${type}`.trim();
        }

        renderNoFolderState(message = 'Choose a folder to start browsing.') {
            this.filteredIndex = [];
            this.selectedIndex = -1;
            this.selectedRelativePath = '';
            this.currentDirectory = '';

            const list = this.modal?.querySelector('#sampleBrowserList');
            if (list) {
                list.innerHTML = `<div class="sample-browser-empty">${message}</div>`;
            }

            const breadcrumbs = this.modal?.querySelector('#sampleBrowserBreadcrumbs');
            if (breadcrumbs) {
                breadcrumbs.innerHTML = '<span class="sample-browser-crumb active">No folder</span>';
            }

            const upButton = this.modal?.querySelector('#sampleBrowserUpBtn');
            if (upButton) {
                upButton.disabled = true;
            }

            this.renderDetails(null);
            this.updateSummary();
        }

        updateSummary() {
            const summary = this.modal?.querySelector('#sampleBrowserSummary');
            if (!summary) return;

            if (!this.workingFolderHandle) {
                summary.textContent = 'No folder open • Click Open Folder to grant access';
                return;
            }

            const total = this.fileIndex.filter((entry) => this.allowedExtensions.includes(entry.ext)).length;
            const filtered = this.filteredIndex.length;
            const filterLabel = this.extensionFilter === 'all'
                ? 'all files'
                : this.extensionFilter.replace('.', '').toUpperCase();
            const skipped = this.scanStats.skippedDirectories > 0
                ? ` • ${this.scanStats.skippedDirectories} folder(s) skipped`
                : '';

            summary.textContent = `${filtered}/${total} shown • ${filterLabel} • ↑↓ move • Space preview • Enter import${skipped}`;
        }

        syncToolbarState() {
            const searchInput = this.modal?.querySelector('#sampleBrowserSearch');
            const autoPreview = this.modal?.querySelector('#sampleBrowserAutoPreview');

            if (searchInput) {
                searchInput.value = this.searchQuery;
            }

            if (autoPreview) {
                autoPreview.checked = this.autoPreviewEnabled;
            }

            if (!this.getAvailableFilters().includes(this.extensionFilter)) {
                this.extensionFilter = 'all';
            }

            this.modal?.querySelectorAll('.sample-browser-filter-btn').forEach((button) => {
                button.classList.toggle('active', button.dataset.filter === this.extensionFilter);
            });
        }

        applyFilter() {
            const query = this.modal?.querySelector('#sampleBrowserSearch')?.value?.trim().toLowerCase() || '';
            this.searchQuery = query;
            this.persistPreferences();
            this.updateBreadcrumbs();

            const matchingFiles = this.fileIndex.filter((entry) => {
                const matchesQuery = entry.searchText.includes(query);
                const matchesAllowed = this.allowedExtensions.includes(entry.ext);
                const matchesType = this.extensionFilter === 'all' || entry.ext === this.extensionFilter;
                return matchesQuery && matchesAllowed && matchesType;
            });

            if (query) {
                const matchingDirectories = this.directoryIndex
                    .filter((entry) => entry.relativePath && entry.searchText.includes(query))
                    .map((entry) => ({ ...entry, ext: '' }));
                this.filteredIndex = [...matchingDirectories, ...matchingFiles];
            } else {
                const childDirectories = this.directoryIndex
                    .filter((entry) => entry.relativePath && entry.parentRelativePath === this.currentDirectory)
                    .map((entry) => ({ ...entry, ext: '' }));
                const childFiles = matchingFiles.filter((entry) => entry.parentRelativePath === this.currentDirectory);
                const parentEntry = this.currentDirectory ? [{
                    kind: 'directory',
                    name: '..',
                    ext: '',
                    relativePath: this.getParentRelativePath(this.currentDirectory),
                    parentRelativePath: this.getParentRelativePath(this.getParentRelativePath(this.currentDirectory)),
                    searchText: ''
                }] : [];

                this.filteredIndex = [...parentEntry, ...childDirectories, ...childFiles];
            }

            this.renderList();
            this.updateSummary();

            if (this.filteredIndex.length === 0) {
                this.selectedIndex = -1;
                this.renderDetails(null);
                return;
            }

            let nextIndex = this.filteredIndex.findIndex((entry) => entry.relativePath === this.selectedRelativePath);
            if (nextIndex === -1) {
                nextIndex = this.filteredIndex.findIndex((entry) => entry.kind !== 'directory');
            }
            if (nextIndex === -1) {
                nextIndex = Math.min(Math.max(this.selectedIndex, 0), this.filteredIndex.length - 1);
            }

            this.selectIndex(nextIndex, false);
        }

        renderList() {
            const list = this.modal?.querySelector('#sampleBrowserList');
            if (!list) return;

            if (this.filteredIndex.length === 0) {
                list.innerHTML = '<div class="sample-browser-empty">No matching items.</div>';
                return;
            }

            list.innerHTML = this.filteredIndex
                .map((entry, index) => {
                    const isDirectory = entry.kind === 'directory';
                    const isPreviewing = this.lastPreviewedPath === entry.relativePath && this.activeSource;
                    const thumbId = encodeURIComponent(entry.relativePath);
                    const thumbnailMarkup = isDirectory ? '' : this.thumbnailCache.get(entry.relativePath);
                    const canHaveThumbnail = !isDirectory && (entry.ext === '.wav' || entry.ext === '.sfz');
                    const badgeLabel = isDirectory ? 'DIR' : entry.ext.replace('.', '').toUpperCase();
                    const secondaryLine = isDirectory
                        ? (entry.name === '..'
                            ? 'Up one level'
                            : `${this.getDirectorySubdirCount(entry.relativePath)} folder(s) | ${this.getDirectoryFileCount(entry.relativePath)} file(s)`)
                        : entry.relativePath;
                    return `
                        <button type="button" class="sample-browser-item${index === this.selectedIndex ? ' selected' : ''}${isDirectory ? ' is-directory' : ''}" data-index="${index}">
                            <span class="sample-browser-item-main">
                                <span class="sample-browser-thumb ${isDirectory ? 'is-directory' : ''} ${canHaveThumbnail ? 'is-audio' : 'is-unavailable'} ${thumbnailMarkup ? 'is-ready' : ''}" data-index="${index}" data-thumb-id="${thumbId}">
                                    ${isDirectory
                                        ? `<span class="sample-browser-thumb-label">${entry.name === '..' ? 'UP' : 'DIR'}</span>`
                                        : (thumbnailMarkup || `<span class="sample-browser-thumb-label">${entry.ext.replace('.', '').toUpperCase()}</span>`)}
                                </span>
                                <span class="sample-browser-item-copy">
                                    <span class="sample-browser-item-top">
                                        <span class="sample-browser-item-name">${entry.name}</span>
                                        <span class="sample-browser-badges">
                                            <span class="sample-browser-badge">${badgeLabel}</span>
                                            ${!isDirectory && isPreviewing ? '<span class="sample-browser-badge is-live">LIVE</span>' : ''}
                                        </span>
                                    </span>
                                    <span class="sample-browser-item-path">${secondaryLine}</span>
                                </span>
                            </span>
                        </button>
                    `;
                })
                .join('');

            list.querySelectorAll('.sample-browser-item').forEach((button) => {
                button.addEventListener('click', () => {
                    const index = parseInt(button.dataset.index, 10);
                    this.selectIndex(index, true);
                });
                button.addEventListener('dblclick', async () => {
                    const index = parseInt(button.dataset.index, 10);
                    this.selectIndex(index, false);
                    const entry = this.filteredIndex[index];
                    if (entry?.kind === 'directory') {
                        this.navigateToDirectory(entry.relativePath, { clearSearch: true });
                        return;
                    }
                    await this.importSelected();
                });
            });

            this.scheduleThumbnailHydration();
        }

        async renderDetails(fileEntry) {
            const details = this.modal?.querySelector('#sampleBrowserDetails');
            const previewButton = this.modal?.querySelector('#sampleBrowserPreviewBtn');
            const importButton = this.modal?.querySelector('#sampleBrowserImportBtn');
            if (!details || !previewButton || !importButton) return;

            const assignmentMarkup = this.browserMode === 'multisample'
                ? this.getMultisampleAssignmentMarkup()
                : '';

            if (!fileEntry) {
                details.innerHTML = `<div class="sample-browser-empty">Select a file.</div>${assignmentMarkup}`;
                previewButton.disabled = true;
                importButton.disabled = true;
                if (this.browserMode === 'multisample') {
                    this.bindMultisampleAssignmentInputs();
                }
                return;
            }

            if (fileEntry.kind === 'directory') {
                details.innerHTML = `
                    <div class="sample-browser-meta-row"><span>Type</span><strong>Directory</strong></div>
                    <div class="sample-browser-meta-row"><span>Path</span><strong>${fileEntry.relativePath || this.workingFolderHandle?.name || 'Root'}</strong></div>
                    <div class="sample-browser-meta-row"><span>Folders</span><strong>${this.getDirectorySubdirCount(fileEntry.relativePath)}</strong></div>
                    <div class="sample-browser-meta-row"><span>Files</span><strong>${this.getDirectoryFileCount(fileEntry.relativePath)}</strong></div>
                ${assignmentMarkup}`;
                previewButton.disabled = true;
                importButton.disabled = true;
                if (this.browserMode === 'multisample') {
                    this.bindMultisampleAssignmentInputs();
                }
                return;
            }

            const previewTarget = await this.resolvePreviewTarget(fileEntry);
            const canPreview = Boolean(previewTarget);
            previewButton.disabled = !canPreview;
            previewButton.textContent = this.lastPreviewedPath === fileEntry.relativePath && this.activeSource ? 'Stop' : 'Preview';
            importButton.disabled = false;

            details.innerHTML = '<div class="sample-browser-empty">Loading metadata...</div>';

            const metadata = await this.loadMetadata(fileEntry);
            if (!this.modal) return;
            if (this.filteredIndex[this.selectedIndex]?.relativePath !== fileEntry.relativePath) return;

            details.innerHTML = `
                <div class="sample-browser-meta-row"><span>Type</span><strong>${metadata?.type ?? '--'}</strong></div>
                <div class="sample-browser-meta-row"><span>Path</span><strong>${fileEntry.relativePath}</strong></div>
                <div class="sample-browser-meta-row"><span>Size</span><strong>${this.formatFileSize(metadata?.size)}</strong></div>
                <div class="sample-browser-meta-row"><span>Duration</span><strong>${this.formatDuration(metadata?.duration)}</strong></div>
                <div class="sample-browser-meta-row"><span>Sample Rate</span><strong>${metadata?.sampleRate ? `${metadata.sampleRate} Hz` : '--'}</strong></div>
                <div class="sample-browser-meta-row"><span>Channels</span><strong>${metadata?.channels ?? '--'}</strong></div>
                <div class="sample-browser-meta-row"><span>Bit Depth</span><strong>${metadata?.bitDepth ?? '--'}</strong></div>
                <div class="sample-browser-meta-row"><span>Preview</span><strong>${canPreview ? (fileEntry.ext === '.sfz' ? 'Uses first SFZ sample' : 'Available') : 'Unavailable'}</strong></div>
            ${assignmentMarkup}`;

            if (this.browserMode === 'multisample') {
                this.bindMultisampleAssignmentInputs();
            }
        }

        getMultisampleAssignmentMarkup() {
            const assignment = this.normalizeMultisampleAssignment(this.multisampleAssignment || {});
            this.multisampleAssignment = assignment;
            return `
                <div class="sample-browser-assignment">
                    <div class="sample-browser-assignment-title">Layer Assignment</div>
                    <div class="sample-browser-assignment-grid">
                        <label class="sample-browser-assignment-field">
                            <span>Root Note</span>
                            <input type="number" min="0" max="127" step="1" id="sampleBrowserRootNote" value="${assignment.rootNote}">
                        </label>
                        <label class="sample-browser-assignment-field">
                            <span>Key Low</span>
                            <input type="number" min="0" max="127" step="1" id="sampleBrowserKeyLow" value="${assignment.keyRangeBottom}">
                        </label>
                        <label class="sample-browser-assignment-field">
                            <span>Key High</span>
                            <input type="number" min="0" max="127" step="1" id="sampleBrowserKeyHigh" value="${assignment.keyRangeTop}">
                        </label>
                        <label class="sample-browser-assignment-field">
                            <span>Vel Low</span>
                            <input type="number" min="0" max="127" step="1" id="sampleBrowserVelLow" value="${assignment.velRangeBottom}">
                        </label>
                        <label class="sample-browser-assignment-field">
                            <span>Vel High</span>
                            <input type="number" min="0" max="127" step="1" id="sampleBrowserVelHigh" value="${assignment.velRangeTop}">
                        </label>
                    </div>
                </div>
            `;
        }

        bindMultisampleAssignmentInputs() {
            const rootInput = this.modal?.querySelector('#sampleBrowserRootNote');
            const keyLowInput = this.modal?.querySelector('#sampleBrowserKeyLow');
            const keyHighInput = this.modal?.querySelector('#sampleBrowserKeyHigh');
            const velLowInput = this.modal?.querySelector('#sampleBrowserVelLow');
            const velHighInput = this.modal?.querySelector('#sampleBrowserVelHigh');
            if (!rootInput || !keyLowInput || !keyHighInput || !velLowInput || !velHighInput) {
                return;
            }

            const syncAssignment = () => {
                const normalized = this.normalizeMultisampleAssignment({
                    rootNote: rootInput.value,
                    keyRangeBottom: keyLowInput.value,
                    keyRangeTop: keyHighInput.value,
                    velRangeBottom: velLowInput.value,
                    velRangeTop: velHighInput.value
                });

                this.multisampleAssignment = normalized;
                rootInput.value = normalized.rootNote;
                keyLowInput.value = normalized.keyRangeBottom;
                keyHighInput.value = normalized.keyRangeTop;
                velLowInput.value = normalized.velRangeBottom;
                velHighInput.value = normalized.velRangeTop;
            };

            [rootInput, keyLowInput, keyHighInput, velLowInput, velHighInput].forEach((input) => {
                input.addEventListener('input', syncAssignment);
                input.addEventListener('change', syncAssignment);
            });
        }

        async selectIndex(index, allowAutoPreview) {
            if (index < 0 || index >= this.filteredIndex.length) {
                return;
            }

            this.selectedIndex = index;
            const fileEntry = this.filteredIndex[index];
            this.selectedRelativePath = fileEntry.relativePath;
            this.persistSelection();
            this.renderList();

            const selectedItem = this.modal?.querySelector(`.sample-browser-item[data-index="${index}"]`);
            selectedItem?.scrollIntoView({ block: 'nearest' });

            await this.renderDetails(fileEntry);

            if (fileEntry.kind === 'directory') {
                this.stopPreview();
                return;
            }

            const canPreview = fileEntry.ext === '.wav' || fileEntry.ext === '.sfz';
            if (allowAutoPreview && this.autoPreviewEnabled && canPreview) {
                await this.previewFile(fileEntry);
            } else if (!canPreview) {
                this.stopPreview();
            }
        }

        async importSelected() {
            if ((this.browserMode === 'pad' || this.browserMode === 'multisample') && !this.selectedPad) {
                this.setStatus('No target pad selected', 'error');
                return;
            }

            const fileEntry = this.filteredIndex[this.selectedIndex];
            if (!fileEntry) {
                this.setStatus('No file selected', 'error');
                return;
            }

            if (fileEntry.kind === 'directory') {
                this.navigateToDirectory(fileEntry.relativePath, { clearSearch: true });
                return;
            }

            try {
                const file = await fileEntry.handle.getFile();
                this.selectedRelativePath = fileEntry.relativePath;
                this.persistSelection();
                this.setStatus(`${this.browserMode === 'preset' ? 'Loading' : this.browserMode === 'multisample' ? 'Adding' : 'Importing'} ${file.name}...`, 'info');
                if (this.browserMode === 'multisample') {
                    await window.BitboxerImport.addWavToMultisamplePad(
                        file,
                        this.selectedPad,
                        this.multisampleAssignment || {}
                    );
                } else {
                    await window.BitboxerImport.unifiedImportHandler(
                        file,
                        'browser',
                        this.browserMode === 'pad' ? this.selectedPad : null
                    );
                }
                this.closeModal();
            } catch (error) {
                console.error('Browser import error:', error);
                this.setStatus(`Import failed: ${error.message}`, 'error');
            }
        }

        handleKeydown(event) {
            if (!this.modal) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                this.closeModal();
                return;
            }

            const activeTag = document.activeElement?.tagName;
            const isTyping = activeTag === 'INPUT' && document.activeElement?.id === 'sampleBrowserSearch';

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (this.filteredIndex.length > 0) {
                    const next = Math.min(this.selectedIndex + 1, this.filteredIndex.length - 1);
                    this.selectIndex(next, true);
                }
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (this.filteredIndex.length > 0) {
                    const next = Math.max(this.selectedIndex - 1, 0);
                    this.selectIndex(next, true);
                }
            } else if (event.key === 'Enter' && !isTyping) {
                event.preventDefault();
                this.importSelected();
            } else if ((event.key === 'Backspace' || event.key === 'ArrowLeft') && !isTyping && this.currentDirectory) {
                event.preventDefault();
                this.navigateToDirectory(this.getParentRelativePath(this.currentDirectory), { clearSearch: true });
            } else if (event.key === ' ' && !isTyping) {
                event.preventDefault();
                const fileEntry = this.filteredIndex[this.selectedIndex];
                if (fileEntry && fileEntry.kind !== 'directory' && (fileEntry.ext === '.wav' || fileEntry.ext === '.sfz')) {
                    this.previewFile(fileEntry);
                }
            }
        }

        buildModal() {
            const modal = document.createElement('div');
            modal.className = 'modal show';
            modal.id = 'sampleBrowserModal';
            modal.style.zIndex = '4000';
            modal.innerHTML = `
                <div class="modal-content sample-browser-modal">
                    <div class="modal-header">
                        <h2>${this.browserTitle}</h2>
                        <button class="close-btn" id="closeSampleBrowserBtn" type="button">&times;</button>
                    </div>
                    <div class="sample-browser-toolbar">
                        <input type="text" id="sampleBrowserSearch" placeholder="Search files or paths..." class="sample-browser-search">
                        <div class="sample-browser-filter-group">
                            ${this.getAvailableFilters().map((filter) => `
                                <button class="sample-browser-filter-btn${filter === 'all' ? ' active' : ''}" type="button" data-filter="${filter}">${filter === 'all' ? 'All' : filter.replace('.', '').toUpperCase()}</button>
                            `).join('')}
                        </div>
                        <label class="sample-browser-toggle">
                            <input type="checkbox" id="sampleBrowserAutoPreview" checked>
                            Auto-preview
                        </label>
                        <button class="btn" id="sampleBrowserRefreshBtn" type="button">Refresh</button>
                        <button class="btn" id="sampleBrowserFolderBtn" type="button">Open Folder</button>
                    </div>
                    <div class="sample-browser-nav">
                        <button class="btn" id="sampleBrowserUpBtn" type="button">Up</button>
                        <div class="sample-browser-breadcrumbs" id="sampleBrowserBreadcrumbs"></div>
                    </div>
                    <div class="sample-browser-subtoolbar">
                        <span class="sample-browser-summary" id="sampleBrowserSummary"></span>
                    </div>
                    <div class="sample-browser-layout">
                        <div class="sample-browser-list" id="sampleBrowserList"></div>
                        <div class="sample-browser-side">
                            <div class="sample-browser-details" id="sampleBrowserDetails"></div>
                            <div class="sample-browser-actions">
                                <button class="btn" id="sampleBrowserPreviewBtn" type="button" disabled>Preview</button>
                                <button class="btn btn-primary" id="sampleBrowserImportBtn" type="button" disabled>${this.importButtonLabel}</button>
                            </div>
                        </div>
                    </div>
                    <div class="status-bar" id="sampleBrowserStatus"></div>
                </div>
            `;

            modal.querySelector('#closeSampleBrowserBtn').addEventListener('click', () => this.closeModal());
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    this.closeModal();
                }
            });

            modal.querySelector('#sampleBrowserSearch').addEventListener('input', () => this.applyFilter());
            modal.querySelector('#sampleBrowserList').addEventListener('scroll', () => this.scheduleThumbnailHydration());
            modal.querySelector('#sampleBrowserUpBtn').addEventListener('click', () => {
                if (this.currentDirectory) {
                    this.navigateToDirectory(this.getParentRelativePath(this.currentDirectory), { clearSearch: true });
                }
            });
            modal.querySelector('#sampleBrowserAutoPreview').addEventListener('change', (event) => {
                this.autoPreviewEnabled = event.target.checked;
                this.persistPreferences();
                if (!this.autoPreviewEnabled) {
                    this.stopPreview();
                }
            });
            modal.querySelectorAll('.sample-browser-filter-btn').forEach((button) => {
                button.addEventListener('click', () => {
                    this.extensionFilter = button.dataset.filter;
                    this.persistPreferences();
                    this.syncToolbarState();
                    this.applyFilter();
                });
            });
            modal.querySelector('#sampleBrowserRefreshBtn').addEventListener('click', () => this.refreshIndex());
            modal.querySelector('#sampleBrowserPreviewBtn').addEventListener('click', async () => {
                const fileEntry = this.filteredIndex[this.selectedIndex];
                await this.previewFile(fileEntry);
            });
            modal.querySelector('#sampleBrowserImportBtn').addEventListener('click', async () => {
                await this.importSelected();
            });
            modal.querySelector('#sampleBrowserFolderBtn').addEventListener('click', async () => {
                const changed = await this.chooseWorkingFolder();
                if (changed) {
                    this.setStatus(`Indexing ${this.workingFolderHandle.name}...`, 'info');
                    await this.refreshIndex();
                }
            });

            return modal;
        }

        async open(options = {}) {
            const {
                targetPad = null,
                mode = 'pad',
                multisampleAssignment = null
            } = options;

            this.configureBrowser({ mode, targetPad, multisampleAssignment });

            if ((mode === 'pad' || mode === 'multisample') && !targetPad) {
                window.BitboxerUtils.setStatus('No pad selected', 'error');
                return false;
            }

            if (!window.showDirectoryPicker) {
                window.BitboxerUtils?.setStatus('Sample browser requires Chrome or Edge for local folder access.', 'error');
                return false;
            }

            if (this.workingFolderHandle !== window.BitboxerData.workingFolderHandle) {
                this.fileIndex = [];
            }
            this.workingFolderHandle = window.BitboxerData.workingFolderHandle;
            this.loadPreferences();
            this.lastPreviewedPath = null;
            this.selectedIndex = -1;

            this.closeModal();
            this.modal = this.buildModal();
            this.syncToolbarState();
            this.updateBreadcrumbs();
            document.body.appendChild(this.modal);
            document.addEventListener('keydown', this.boundKeydown);

            if (!this.workingFolderHandle) {
                this.renderNoFolderState();
                this.setStatus('Choose a folder to browse', 'info');
                this.modal.querySelector('#sampleBrowserFolderBtn')?.focus();
                return true;
            }

            const accessGranted = await this.ensureWorkingFolderAccess();
            if (!accessGranted) {
                this.workingFolderHandle = null;
                this.renderNoFolderState('Working folder access was denied. Choose a folder again.');
                this.setStatus('Working folder permission denied', 'error');
                this.modal.querySelector('#sampleBrowserFolderBtn')?.focus();
                return true;
            }

            this.setStatus(`Indexing ${this.workingFolderHandle.name}...`, 'info');

            try {
                await this.ensureIndex(this.workingFolderHandle);
                if (this.currentDirectory && !this.directoryIndex.some((entry) => entry.relativePath === this.currentDirectory)) {
                    this.currentDirectory = '';
                }
                this.applyFilter();
                if (this.filteredIndex.length > 0 && this.selectedIndex < 0) {
                    await this.selectIndex(0, false);
                } else if (this.filteredIndex.length === 0) {
                    this.renderDetails(null);
                }
                this.setStatus(`${this.fileIndex.length} file(s) available in ${this.workingFolderHandle.name}`, 'success');
                this.modal.querySelector('#sampleBrowserSearch')?.focus();
                return true;
            } catch (error) {
                console.error('Sample browser indexing error:', error);
                this.setStatus(`Browser failed: ${error.message}`, 'error');
                return false;
            }
        }

        async openForPad(padElement) {
            return this.open({ mode: 'pad', targetPad: padElement });
        }

        async openForMultisample(targetPad, assignment = {}) {
            return this.open({ mode: 'multisample', targetPad, multisampleAssignment: assignment });
        }

        async openForPreset() {
            return this.open({ mode: 'preset' });
        }
    }

    window.BitboxerSampleBrowser = new SampleBrowserPreviewController();
})();
