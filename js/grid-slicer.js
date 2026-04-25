(function () {
    const GRID_DIVISIONS = {
        '1bar': 1,
        '1/2': 0.5,
        '1/4': 0.25,
        '1/8': 0.125,
        '1/8T': 1 / 12,
        '1/16': 1 / 16,
        '1/16T': 1 / 24,
        '1/32': 1 / 32
    };

    function computeSamplesPerQuarter(sampleRate, bpm) {
        return (60 / bpm) * sampleRate;
    }

    function computeGridSlicePositions({
        sampleRate,
        totalSamples,
        bpm,
        division = '1/16',
        bars = null,
        offsetSamples = 0,
        numerator = 4,
        denominator = 4
    }) {
        if (!sampleRate || !totalSamples || !bpm) {
            return [];
        }

        const quarterNoteSamples = computeSamplesPerQuarter(sampleRate, bpm);
        const barSamples = quarterNoteSamples * numerator * (4 / denominator);
        const divisionFactor = GRID_DIVISIONS[division];

        if (!divisionFactor) {
            throw new Error(`Unknown division: ${division}`);
        }

        const stepSamples = Math.round(barSamples * divisionFactor);
        if (stepSamples <= 0) {
            return [];
        }

        const safeOffset = Math.max(0, Math.round(offsetSamples));
        const maxSamples = bars
            ? Math.min(totalSamples, Math.round(barSamples * bars))
            : totalSamples;

        const positions = [0];
        for (let pos = safeOffset; pos < maxSamples; pos += stepSamples) {
            positions.push(pos);
        }

        return [...new Set(positions)]
            .filter((pos) => pos >= 0 && pos < totalSamples)
            .sort((a, b) => a - b);
    }

    window.BitboxerGridSlicer = {
        GRID_DIVISIONS,
        computeSamplesPerQuarter,
        computeGridSlicePositions
    };
})();
