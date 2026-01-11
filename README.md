# Typewrite Something

![Made With Love](http://img.shields.io/badge/made%20with-love-red.svg?style=for-the-badge)
![MIT License](http://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)

> **Fork Notice:** This is an enhanced fork of the original [bozdoz/typewritesomething](https://github.com/bozdoz/typewritesomething) by [Benjamin J DeLong](https://github.com/bozdoz). Full credit goes to the original author for this beautiful concept.

<p align="center">
  <img width="600" alt="Typewriter Screenshot" src="https://user-images.githubusercontent.com/1410985/114257815-ca1e6380-9998-11eb-8626-fb561da639f6.png">
</p>

---

## What is This?

**Typewrite Something** is a beautiful, minimalist typewriter simulator that runs in your browser. It recreates the nostalgic experience of typing on a vintage typewriter - complete with authentic sounds, imperfect letter placement, and the satisfying click-clack of mechanical keys.

Whether you're a writer seeking distraction-free creativity, someone who loves the aesthetic of vintage typewriters, or just looking for a unique way to jot down thoughts - this app brings the charm of analog writing to the digital age.

## Why It's Amazing

- **Authentic Typewriter Feel** - Each keystroke produces realistic typewriter sounds and slightly imperfect letter placement, just like a real typewriter
- **Distraction-Free Writing** - No toolbars, no formatting options, no distractions. Just you and the page
- **Infinite Canvas** - Drag the page around freely. Your canvas is unlimited
- **Save Your Work** - Save multiple writings and load them later
- **Works Offline** - Once loaded, works without internet connection
- **No Account Required** - Your writings are saved locally in your browser

## Fork Enhancements

This fork adds powerful new features to the original:

### Hebrew RTL Support
Full right-to-left language support for Hebrew writers:
- **Smart Cursor Positioning** - Cursor automatically jumps to the right margin when you start typing Hebrew
- **RTL-Aware Line Breaks** - Pressing Enter in Hebrew mode starts the new line from the right side
- **Seamless Language Switching** - Mix Hebrew and English naturally; the app detects and adapts automatically

### High-Resolution Export
Export your typewriter pages as beautiful images:
- **2K Resolution** - Exports at 2560x1440 for crisp, print-ready quality
- **Clean White Background** - Professional white paper background
- **One-Click Download** - Right-click menu → Export as Image → Done!

---

## How to Use

1. **Start Typing** - Click anywhere on the page and start typing
2. **Move Around** - Click and drag to pan the infinite canvas
3. **New Line** - Press `Enter` for a new line
4. **Tab** - Press `Tab` for indentation
5. **Navigate** - Use arrow keys to move the cursor
6. **Right-Click Menu** - Access save, load, paste, and export features

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Any Letter/Number` | Type character |
| `Enter` | New line |
| `Tab` | Add tab space |
| `Backspace` | Move cursor left |
| `Arrow Keys` | Navigate cursor |

### Right-Click Menu Options

- **New** - Start fresh with a blank page
- **Save** - Save your current writing
- **View Saved** - Browse and load your saved writings
- **Paste Text** - Paste text from clipboard
- **Export as Image** - Download as 2K PNG image

---

## Running Locally

### Prerequisites
- Node.js 20 or higher
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/hoodini/typewritesomething.git

# Navigate to the project
cd typewritesomething

# Install dependencies
npm install

# Start the development server
npm start
```

The app will open at `http://localhost:3001`

### Building for Production

```bash
npm run build
```

---

## Tech Stack

- **TypeScript** - Type-safe JavaScript
- **Rollup** - Module bundler
- **Canvas API** - For rendering text with authentic typewriter imperfections
- **Howler.js** - Audio library for typewriter sounds
- **Browser-Sync** - Live reload development server

---

## Original Project

This project is based on the wonderful work by [Benjamin J DeLong](https://github.com/bozdoz).

- **Original Repository:** [bozdoz/typewritesomething](https://github.com/bozdoz/typewritesomething)
- **Live Demo:** [typewritesomething.com](https://typewritesomething.com)

---

## License

MIT License - Feel free to use, modify, and distribute.

---

<p align="center">
  <i>Write something beautiful.</i>
</p>
