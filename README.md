# Bitbox-editor fork by Dr Delos

Fork of `BartBral/Bitbox-editor` with BITBOXER-focused workflow and UI enhancements for 1010music Bitbox Micro and mk2.

## Links

- [Enhanced fork branch](https://github.com/kf4u43D/Bitbox-editor/tree/bitboxer-enhancements)
- [Upstream editor demo](https://bartbral.github.io/Bitbox-editor/)

Note: the upstream demo may not include the fork-only changes from `bitboxer-enhancements`.

## Main additions

- Pad preview directly from the grid
- Custom sample browser with local folder navigation
- Audio preview before import
- BPM / division grid slicing
- UI themes
- Startup `Project Setup` flow
- Improved import workflow for presets and pads

## Quick start

1. Open the app.
2. `Project Setup` opens at startup.
3. Choose a working folder if you want automatic sample lookup.
4. Load a preset or import pads from the browser.
5. Edit pads, slices, modulation, FX, then save as ZIP.

You can reopen `Project Setup` later from the top-right button. You can also choose a folder directly inside the sample browser with `Open Folder`.

## Working folder

The working folder is used to:

- browse samples locally
- preview audio before import
- resolve referenced samples when loading presets or SFZ content

Because this is a web app, folder access is granted by the browser. On first use, Chrome or Edge may show the native directory picker so you can authorize access.

No samples or presets are uploaded anywhere. Everything stays local on your machine.

## Import workflows

### Load Preset

- Click `Load Preset`
- The custom browser opens
- Choose `.xml` or `.zip`
- If needed, click `Open Folder` to grant access first

You can also drag and drop preset files onto the page.

### Import Pad

- Select a pad
- Click `Import Pad`
- The custom sample browser opens
- Preview and choose `.wav`, `.sfz`, `.zip`, or pad JSON ZIP content

You can also drag and drop a file directly onto a pad.

## Pad editing

Pads can be edited by double-clicking a pad or using the context menu.

Main areas include:

- core sound parameters
- envelopes
- LFO
- sample position and loop settings
- slicer workflow
- multisample configuration
- modulation matrix

## Grid slicing

For slicer workflows, the editor includes BPM / division based grid slicing.

Typical flow:

1. Open a sample pad
2. Switch the pad to `Slicer`
3. Set `Grid BPM`, `Division`, and optional offset
4. Apply the grid

## Preview

This fork adds:

- pad preview from the pad grid
- sample preview in the browser before import

## Themes

The UI includes multiple themes, with `Dark Spectral` as the default fallback theme for first launch.

## Save / export

`Save Preset` exports a ZIP containing:

- `preset.xml`
- sample files
- multisample folders when needed
- placeholders / readme notes for missing files when applicable

## Device modes

- `Bitbox Micro`: 8-pad visual layout, EQ unavailable
- `Bitbox mk2`: full 16-pad layout and full EQ access

Greyed out controls are primarily a visual reminder. The underlying preset format remains shared.

## Formats

Supported import / export formats include:

- XML
- ZIP
- WAV
- SFZ
- JSON pad exports

## Browser support

Recommended:

- Chrome
- Edge

Other browsers may work for basic usage, but folder access and some workflows are best on Chromium-based browsers.

## Upstream

Original project: `BartBral/Bitbox-editor`
