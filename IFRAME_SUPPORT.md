# Iframe Support Implementation

## Overview
The Read-Aloud extension has been enhanced to support reading text content from iframes on a webpage. This provides a seamless reading experience that includes content from embedded frames, such as documentation sites, educational platforms, and news sites with embedded widgets.

## Key Changes Made

### 1. Background Script (js/events.js)
- **Enhanced content script injection**: Added `allFrames: true` to `brapi.scripting.executeScript()` calls
- **Frame-aware injection**: Modified `injectContentScript()` and `contentScriptAlreadyInjected()` functions to work with all frames when no specific frameId is provided

### 2. Content Script Coordination (js/content.js)
- **Frame detection**: Added `isMainFrame` detection using `window.self === window.top`
- **Frame coordination**: Implemented main frame coordinator that manages communication with child frames
- **Message handling**: Added postMessage-based communication between main frame and iframes
- **Text aggregation**: Enhanced `getTexts()` to collect and combine text from all accessible frames

#### New Functions:
- `initMainFrameCoordinator()`: Initializes coordination in the main frame
- `initChildFrame()`: Sets up message listeners in iframe contexts
- `getTextsWithFrames()`: Aggregates text from main frame and all accessible iframes
- `getTextsFromFrame()`: Communicates with specific iframe to retrieve text
- `handleFrameRequest()`: Handles incoming requests from parent frame

### 3. Frame Messaging (js/messaging.js)
- **Frame messaging utility**: Added `FrameMessagingPeer` class for iframe communication
- **Cross-frame support**: Provides structured communication between frames

### 4. HTML Document Handler (js/content/html-doc.js)
- **No changes needed**: The existing text extraction logic works within each frame
- **Frame-agnostic**: Each frame runs its own instance of the text extraction logic

## How It Works

### Initialization
1. When content scripts are injected, they detect if they're running in the main frame or an iframe
2. Main frame initializes as coordinator, iframes initialize as child frames
3. Each frame sets up appropriate message listeners

### Text Extraction Process
1. When reading begins, the main frame's `getTexts()` function is called
2. Main frame extracts its own text using the existing `readAloudDoc.getTexts()`
3. Main frame discovers all `<iframe>` elements on the page
4. For each iframe, main frame sends a `getFrameTexts` request via postMessage
5. Each accessible iframe responds with its extracted text
6. Main frame aggregates all text results in document order
7. Combined text is returned for reading

### Error Handling
- **Cross-origin iframes**: Gracefully handles iframes that cannot be accessed due to CORS restrictions
- **Timeout protection**: 5-second timeout for iframe responses
- **Fallback behavior**: If iframe access fails, continues with main frame content only
- **Logging**: Warnings logged for inaccessible iframes, success messages for frame aggregation

## Security Considerations
- **Same-origin policy**: Respects browser security by only accessing same-origin iframes
- **Cross-origin handling**: Safely handles cross-origin iframe access failures
- **Message validation**: Validates message structure and origin before processing
- **Timeout protection**: Prevents hanging on unresponsive iframes

## User Experience Improvements
- **Seamless reading**: Users get all page content read without manual iframe interaction
- **Visual feedback**: Console logging provides visibility into frame processing
- **Graceful degradation**: Falls back to main frame only if iframe access fails
- **Performance**: Parallel iframe processing for faster text aggregation

## Testing Recommendations
The iframe support should be tested on:
1. **Documentation sites** with embedded content (e.g., GitHub Pages with embedded examples)
2. **Educational platforms** with iframe-based lessons
3. **News sites** with embedded widgets or social media content
4. **Mixed content scenarios** with both accessible and restricted iframes
5. **Cross-origin iframe scenarios** to verify graceful handling

## Technical Notes
- Uses `postMessage` API for secure cross-frame communication
- Maintains backward compatibility with existing single-frame behavior
- Does not require additional permissions beyond existing extension capabilities
- Frame detection is automatic and requires no user configuration

## Future Enhancements
Potential improvements could include:
- User setting to enable/disable iframe reading
- Visual indicators showing which frames contain readable content
- Frame-specific highlighting coordination
- Support for nested iframe hierarchies