# Prime Time Plus Chrome Extension

A Chrome extension that enhances the Prime Time web application with additional functionality.

## Features

- **Working Days Calculator**: Automatically converts time displays (e.g., "103:12") to include working days equivalent (e.g., "103:12 (13.53d)")
- **Real-time Updates**: Monitors page changes and updates time displays dynamically
- **Clean Integration**: Non-intrusive enhancement that preserves original functionality

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select this directory
4. Navigate to the Prime Time web app at `https://provincieantwerpen.get.be/Primetime/webapp/?locale=nl`

## Configuration

- **Working Day**: 8 hours and 36 minutes (516 minutes total)
- **Target Elements**: Elements with class `gwt-HTML primion-label gwt-Label GKPVO15PNB-eu-primion-xtremis-client-home-Css-clickableLink`

## Architecture

The extension is built with extensibility in mind:

- `content.js`: Main logic in a class-based structure
- `manifest.json`: Extension configuration
- `popup.html/js`: User interface and status display
- Modular design allows easy addition of new features

## Adding New Features

To extend the extension:

1. Add new methods to the `PrimeTimePlus` class in `content.js`
2. Update the popup interface if needed
3. Add new permissions to `manifest.json` if required

## Development

The extension uses Manifest V3 and follows Chrome extension best practices:
- Content scripts for DOM manipulation
- Popup for user interface
- Proper permissions and host restrictions
- MutationObserver for dynamic content handling