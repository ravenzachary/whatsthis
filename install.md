# What's This? — Installation Guide

## Prerequisites

- **Google Chrome** (version 116 or later) on Mac, Windows, or Linux
- An **Anthropic API key** — get one at https://console.anthropic.com

## Install from Zip File

1. **Unzip** the `whatsthis.zip` file to any folder on your computer

2. Open Chrome and go to:
   ```
   chrome://extensions
   ```

3. Enable **Developer mode** (toggle in the top-right corner)

4. Click **"Load unpacked"**

5. Select the **unzipped `whatsthis` folder** (the one containing `manifest.json`)

6. A **Welcome** page will open automatically to walk you through setup

7. If the extension icon doesn't appear in your toolbar, click the **puzzle piece icon** (Extensions menu) and **pin** "What's This?"

## Quick Setup (via Welcome Page)

The welcome page that opens on install will guide you through:

1. **Enter your API key** — paste your `sk-ant-...` key (it's validated automatically)
2. **Choose a response mode** — Fast, Balanced (recommended), or Deep
3. **See how to use it** — text, images, video, follow-ups, keyboard shortcuts

That's it — you're ready to go.

## How to Use

| Action | How |
|---|---|
| **Text** | Select text and wait ~1 second, or right-click → "What's This?" |
| **Images** | Hover over an image for ~1.5 seconds, or right-click → "What's This?" |
| **Any element** | Right-click → "What's This? (Analyze Element)" |
| **Video** | Right-click → "What's This? (Video Frame)" |
| **Follow-up** | Type a question in the popover after a response |
| **Keyboard** | **F2** (quick), or **Cmd+Shift+U** / **Ctrl+Shift+U** |

## Features

- Streaming AI responses that appear word-by-word
- Dual-model analysis (quick answer + deeper analysis)
- Multi-turn follow-up conversations (up to 4 per query)
- Cursor-aware image analysis — point at a specific detail
- Draggable, multiple simultaneous popovers
- Copy, Read Aloud, Share, and Re-query buttons
- Query history with searchable past responses
- Dark mode support (matches system theme)
- Works on any website

## Troubleshooting

| Issue | Fix |
|---|---|
| No context menu | Refresh the page after installing |
| "No API key set" | Click the extension icon and enter your key |
| "Invalid API key" | Check your key at https://console.anthropic.com |
| Icon not visible | Click the puzzle piece in Chrome, pin "What's This?" |
| Image analysis not working | Try right-click → "What's This? (Analyze Element)" |

## Platform Support

Works identically on **macOS**, **Windows**, and **Linux**. No build step, no native dependencies.
