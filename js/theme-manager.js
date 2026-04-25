(function () {
    const STORAGE_KEY = 'bitboxer.uiTheme';

    const themes = {
        'warm-ember': {
            label: 'Warm Ember',
            vars: {
                '--color-bg-primary': '#1a1614',
                '--color-bg-secondary': '#2a2420',
                '--color-bg-tertiary': '#3a332d',
                '--color-border': '#4a4038',
                '--color-text-primary': '#e8ddd0',
                '--color-text-secondary': '#d0c2b9',
                '--color-accent-blue': '#a35a2d',
                '--color-accent-green': '#a35a2d',
                '--color-accent-yellow': '#ffb347',
                '--color-accent-red': '#ff5e5e',
                '--color-accent-bright-orange': '#ffa600',
                '--color-accent-orange': '#ffa600',
                '--page-gradient-start': '#1a1612',
                '--page-gradient-mid-a': '#2a1a15',
                '--page-gradient-mid-b': '#1a1612',
                '--page-gradient-end': '#15221a',
                '--line-accent': '#9f582c46',
                '--waveform-line': '#ffa600',
                '--waveform-center': '#4a4038',
                '--pad-selected-bg': '#7d4514',
                '--pad-active-bg': '#582f13',
                '--pad-active-selected-bg': '#794614',
                '--pad-selected-glow': 'rgba(255, 238, 0, 0.3)',
                '--pad-active-selected-glow': '#9946137c',
                '--select-surface': '#6d3d20',
                '--select-surface-hover': '#84502b',
                '--select-option-selected': '#ffa600',
                '--scrollbar-track': '#241d1a',
                '--scrollbar-thumb': '#8d4d26',
                '--scrollbar-thumb-hover': '#b36432',
                '--preview-ring': 'rgba(255, 166, 0, 0.65)',
                '--preview-fill': 'rgba(255, 166, 0, 0.2)',
                '--drag-over-bg': '#4a4a2a',
                '--marker-sample': '#ff6b6b',
                '--marker-loop': '#7fb6ff',
                '--marker-slice': '#8fe388',
                '--overlay-accent': '#ffb347',
                '--beat-grid': 'rgba(163, 90, 45, 0.5)',
                '--beat-grid-subtle': 'rgba(163, 90, 45, 0.2)'
            }
        },
        'dark-coral': {
            label: 'Dark Coral',
            vars: {
                '--color-bg-primary': '#05080c',
                '--color-bg-secondary': '#101a20',
                '--color-bg-tertiary': '#1c2a31',
                '--color-border': '#6a7d83',
                '--color-text-primary': '#f8e1c7',
                '--color-text-secondary': '#c9b7aa',
                '--color-accent-blue': '#cf6f5c',
                '--color-accent-green': '#f2a893',
                '--color-accent-yellow': '#f2a893',
                '--color-accent-red': '#ff7d72',
                '--color-accent-bright-orange': '#cf6f5c',
                '--color-accent-orange': '#cf6f5c',
                '--page-gradient-start': '#05080c',
                '--page-gradient-mid-a': '#11151e',
                '--page-gradient-mid-b': '#1b2225',
                '--page-gradient-end': '#2a1614',
                '--line-accent': '#cf6f5c44',
                '--waveform-line': '#cf6f5c',
                '--waveform-center': '#485861',
                '--pad-selected-bg': '#4c2420',
                '--pad-active-bg': '#3b1e1a',
                '--pad-active-selected-bg': '#644038',
                '--pad-selected-glow': 'rgba(207, 111, 92, 0.28)',
                '--pad-active-selected-glow': 'rgba(242, 168, 147, 0.24)',
                '--select-surface': '#31252a',
                '--select-surface-hover': '#423137',
                '--select-option-selected': '#cf6f5c',
                '--scrollbar-track': '#10181d',
                '--scrollbar-thumb': '#5a4448',
                '--scrollbar-thumb-hover': '#7a5c61',
                '--preview-ring': 'rgba(207, 111, 92, 0.52)',
                '--preview-fill': 'rgba(207, 111, 92, 0.18)',
                '--drag-over-bg': '#2e3332',
                '--marker-sample': '#ff8c7e',
                '--marker-loop': '#9cbdd1',
                '--marker-slice': '#f2a893',
                '--overlay-accent': '#f2a893',
                '--beat-grid': 'rgba(207, 111, 92, 0.45)',
                '--beat-grid-subtle': 'rgba(207, 111, 92, 0.18)'
            }
        },
        'dark-spectral': {
            label: 'Dark Spectral',
            vars: {
                '--color-bg-primary': '#120a08',
                '--color-bg-secondary': '#1f2e43',
                '--color-bg-tertiary': '#314158',
                '--color-border': '#7a91ab',
                '--color-text-primary': '#fbe8cc',
                '--color-text-secondary': '#cdd8e2',
                '--color-accent-blue': '#f6b59a',
                '--color-accent-green': '#9fd7ec',
                '--color-accent-yellow': '#f6b59a',
                '--color-accent-red': '#e58fa4',
                '--color-accent-bright-orange': '#f6b59a',
                '--color-accent-orange': '#f6b59a',
                '--page-gradient-start': '#120a08',
                '--page-gradient-mid-a': '#1a1522',
                '--page-gradient-mid-b': '#1f2e43',
                '--page-gradient-end': '#3b2330',
                '--line-accent': '#9fd7ec3d',
                '--waveform-line': '#b8c9ea',
                '--waveform-center': '#4d6383',
                '--pad-selected-bg': '#263552',
                '--pad-active-bg': '#223248',
                '--pad-active-selected-bg': '#31476b',
                '--pad-selected-glow': 'rgba(159, 215, 236, 0.24)',
                '--pad-active-selected-glow': 'rgba(246, 181, 154, 0.22)',
                '--select-surface': '#3b2f3b',
                '--select-surface-hover': '#4b3b49',
                '--select-option-selected': '#f6b59a',
                '--scrollbar-track': '#1a1f2c',
                '--scrollbar-thumb': '#6b5a69',
                '--scrollbar-thumb-hover': '#8b7385',
                '--preview-ring': 'rgba(246, 181, 154, 0.52)',
                '--preview-fill': 'rgba(246, 181, 154, 0.18)',
                '--drag-over-bg': '#38455d',
                '--marker-sample': '#f3a0a8',
                '--marker-loop': '#b8c9ea',
                '--marker-slice': '#f6d29a',
                '--overlay-accent': '#f6d29a',
                '--beat-grid': 'rgba(184, 201, 234, 0.42)',
                '--beat-grid-subtle': 'rgba(184, 201, 234, 0.18)'
            }
        },
        'light-prism': {
            label: 'Light Prism',
            vars: {
                '--color-bg-primary': '#d8e5ee',
                '--color-bg-secondary': '#f3f1ec',
                '--color-bg-tertiary': '#ffffff',
                '--color-border': '#7d97b1',
                '--color-text-primary': '#1f4f8c',
                '--color-text-secondary': '#4f6a88',
                '--color-accent-blue': '#1f4f8c',
                '--color-accent-green': '#59dff2',
                '--color-accent-yellow': '#f29b3d',
                '--color-accent-red': '#b05068',
                '--color-accent-bright-orange': '#1f4f8c',
                '--color-accent-orange': '#1f4f8c',
                '--page-gradient-start': '#c4d8e7',
                '--page-gradient-mid-a': '#f3f1ec',
                '--page-gradient-mid-b': '#d8edf4',
                '--page-gradient-end': '#f8e7d7',
                '--line-accent': '#1f4f8c2a',
                '--waveform-line': '#3d648f',
                '--waveform-center': '#8ea4bc',
                '--pad-selected-bg': '#f6b59a',
                '--pad-active-bg': '#eed8cd',
                '--pad-active-selected-bg': '#efc2ad',
                '--pad-selected-glow': 'rgba(246, 181, 154, 0.26)',
                '--pad-active-selected-glow': 'rgba(31, 79, 140, 0.16)',
                '--select-surface': '#cbb6ad',
                '--select-surface-hover': '#bda69d',
                '--select-option-selected': '#f6b59a',
                '--scrollbar-track': '#c9d7e1',
                '--scrollbar-thumb': '#a98d84',
                '--scrollbar-thumb-hover': '#92756d',
                '--preview-ring': 'rgba(246, 181, 154, 0.48)',
                '--preview-fill': 'rgba(246, 181, 154, 0.16)',
                '--drag-over-bg': '#d8d9d2',
                '--marker-sample': '#c87a87',
                '--marker-loop': '#6c88a6',
                '--marker-slice': '#d8a06e',
                '--overlay-accent': '#d8a06e',
                '--beat-grid': 'rgba(61, 100, 143, 0.28)',
                '--beat-grid-subtle': 'rgba(61, 100, 143, 0.12)'
            }
        }
    };

    function getThemeNames() {
        return Object.keys(themes);
    }

    function getThemeDefinition(name) {
        return themes[name] ?? themes['dark-spectral'];
    }

    function applyTheme(name) {
        const resolvedName = themes[name] ? name : 'dark-spectral';
        const theme = getThemeDefinition(resolvedName);
        Object.entries(theme.vars).forEach(([key, value]) => {
            document.documentElement.style.setProperty(key, value);
        });
        document.documentElement.dataset.theme = resolvedName;

        try {
            localStorage.setItem(STORAGE_KEY, resolvedName);
        } catch {
            // no-op
        }

        const select = document.getElementById('themeSelect');
        if (select) {
            select.value = resolvedName;
        }

        window.dispatchEvent(new CustomEvent('bitboxer:themechange', {
            detail: { theme: resolvedName }
        }));
    }

    function initThemeSelector() {
        const select = document.getElementById('themeSelect');
        if (!select || select.dataset.initialized === 'true') {
            return;
        }

        select.innerHTML = getThemeNames()
            .map((name) => `<option value="${name}">${themes[name].label}</option>`)
            .join('');

        select.addEventListener('change', () => {
            applyTheme(select.value);
        });

        select.dataset.initialized = 'true';
    }

    function init() {
        initThemeSelector();

        let savedTheme = 'dark-spectral';
        try {
            savedTheme = localStorage.getItem(STORAGE_KEY) || 'dark-spectral';
        } catch {
            savedTheme = 'dark-spectral';
        }

        applyTheme(savedTheme);
    }

    window.BitboxerTheme = {
        themes,
        getThemeNames,
        getThemeDefinition,
        applyTheme,
        init
    };

    document.addEventListener('DOMContentLoaded', () => {
        window.BitboxerTheme.init();
    });
})();
