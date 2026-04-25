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
                '--waveform-center': '#4a4038'
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
                '--waveform-center': '#485861'
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
                '--waveform-line': '#9fd7ec',
                '--waveform-center': '#52657f'
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
                '--waveform-line': '#1f4f8c',
                '--waveform-center': '#9cb3c9'
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
