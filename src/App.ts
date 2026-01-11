import MultiAudio from './utils/MultiAudio';
import NO_AUDIO from './helpers/NO_AUDIO';
import { TypeWriter } from './Typewriter';
import { container, textInput, cursorCanvas } from './helpers/getElements';
import positionElem from './utils/positionElem';
import getPositionFromEvent from './utils/getPositionFromEvent';
import Vector from './utils/Vector';
import Menu from './Menu';
import addLongTouch from './utils/addLongTouch';
import getAppMenu from './getAppMenu';
import { TypewriterScene3D } from './TypewriterScene3D';

const isIos = /iPad|iPhone|iPod/.test(navigator.platform);

const keypressAudio = new MultiAudio(
  './static/audio/keypress.mp3',
  // ios struggles with playing multi-audio; needs to have at most 3
  isIos ? 3 : 7
);
const newlineAudio = new MultiAudio('./static/audio/return.mp3', 2);
const eventTarget = cursorCanvas;

class App {
  mousemovedelay = 150;

  running = false;

  typewriter = new TypeWriter();

  menu: Menu | null = null;

  removeLongTouch = () => {};

  // 3D Mode properties
  is3DMode = false;

  scene3D: TypewriterScene3D | null = null;

  modeToggleBtn: HTMLButtonElement | null = null;

  container2D: HTMLElement | null = null;

  container3D: HTMLElement | null = null;

  reset() {
    this.running = true;
    this.typewriter.reset();
    this.events('on');
    this.emptyText();
    this.focusText();
  }

  start() {
    if (this.running) return;

    this.reset();

    this.menu = getAppMenu(this);

    // Setup 3D mode toggle
    this.setupModeToggle();
  }

  setupModeToggle() {
    this.modeToggleBtn = document.getElementById(
      'mode-toggle'
    ) as HTMLButtonElement;
    this.container2D = document.getElementById('container');
    this.container3D = document.getElementById('container-3d');

    if (this.modeToggleBtn) {
      this.modeToggleBtn.addEventListener('click', () => this.toggleMode());
    }
  }

  toggleMode() {
    this.is3DMode = !this.is3DMode;

    if (this.is3DMode) {
      this.enter3DMode();
    } else {
      this.exit3DMode();
    }
  }

  enter3DMode() {
    // Update UI
    this.modeToggleBtn?.classList.add('active-3d');
    const modeIcon = this.modeToggleBtn?.querySelector('.mode-icon');
    if (modeIcon) modeIcon.textContent = '2D';

    // Switch containers
    this.container2D?.classList.remove('active');
    this.container3D?.classList.add('active');

    // Initialize 3D scene if not exists
    if (!this.scene3D) {
      this.scene3D = new TypewriterScene3D('container-3d');
    }

    // Setup right-click menu for 3D mode
    this.scene3D.onContextMenu((e) => {
      const position = new Vector(e.clientX, e.clientY);
      this.menu?.openMenu(position);
    });

    // Setup 3D keyboard events
    this.setup3DKeyboardEvents();

    // Keep text input focused for keyboard capture
    textInput.focus();
  }

  exit3DMode() {
    // Update UI
    this.modeToggleBtn?.classList.remove('active-3d');
    const modeIcon = this.modeToggleBtn?.querySelector('.mode-icon');
    if (modeIcon) modeIcon.textContent = '3D';

    // Switch containers
    this.container3D?.classList.remove('active');
    this.container2D?.classList.add('active');

    // Remove 3D keyboard events (2D events are already active)
    this.remove3DKeyboardEvents();

    // Refocus text input
    this.focusText();
  }

  private handle3DKeyDown = (e: KeyboardEvent) => {
    if (!this.is3DMode || !this.scene3D) return;

    const isMeta = e.altKey || e.ctrlKey || e.metaKey;
    if (isMeta) return;

    // Skip function keys (used for camera presets)
    if (e.key.startsWith('F') && e.key.length <= 3) return;

    const { key } = e;

    if (key === 'Enter') {
      this.scene3D.newline();
      newlineAudio.play();
      e.preventDefault();
    } else if (key === 'Backspace') {
      this.scene3D.backspace();
      keypressAudio.play();
      e.preventDefault();
    } else if (key === 'Tab') {
      // Add tab spaces
      for (let i = 0; i < 4; i += 1) {
        this.scene3D.typeCharacter(' ');
      }
      keypressAudio.play();
      e.preventDefault();
    } else if (key.length === 1) {
      // Single character - play audio and prevent default
      this.scene3D.typeCharacter(key);
      keypressAudio.play();
      e.preventDefault();
    }
  };

  setup3DKeyboardEvents() {
    document.addEventListener('keydown', this.handle3DKeyDown);
  }

  remove3DKeyboardEvents() {
    document.removeEventListener('keydown', this.handle3DKeyDown);
  }

  stop() {
    if (!this.running) return;
    this.running = false;

    // kill events
    this.events('off');
    this.removeMoveEvent();

    // Clean up 3D
    if (this.scene3D) {
      this.scene3D.dispose();
      this.scene3D = null;
    }
    this.remove3DKeyboardEvents();

    this.menu?.destroy();

    this.menu = null;
  }

  events = (onoff = 'on') => {
    const documentEvents: Record<string, any> = {
      mousedown: this.handleMouseDown,
      touchstart: this.handleTouchStart,
      mouseup: this.handleMouseUp,
      touchend: this.handleMouseUp,
    };
    const cursorEvents: Record<string, any> = {
      keydown: this.handleKeyDown,
      keyup: this.handleKeyUp,
      focus: this.handleFocus,
      keypress: this.handleKeyPress,
    };

    const method = onoff === 'on' ? 'addEventListener' : 'removeEventListener';

    // eslint-disable-next-line no-restricted-syntax, guard-for-in
    for (const key in documentEvents) {
      const fnc = documentEvents[key];
      eventTarget[method](key, fnc);
    }

    // eslint-disable-next-line no-restricted-syntax, guard-for-in
    for (const key in cursorEvents) {
      const fnc = cursorEvents[key];
      textInput[method](key, fnc);
    }

    if (onoff === 'on') {
      // TODO: maybe move this event to Menu
      this.removeLongTouch = addLongTouch(eventTarget, (e) => {
        const position = getPositionFromEvent(e);

        // remove mobile keyboard for css positioning of menu
        textInput.blur();

        this.menu?.openMenu(position);
      });
    } else {
      this.removeLongTouch();
      this.removeLongTouch = () => {};
    }
  };

  pressedKeys: Record<string, boolean> = {};

  /**
   * keydown handles audio
   * @param {KeyboardEvent} e
   */
  handleKeyDown = (e: KeyboardEvent) => {
    const isMeta = e.altKey || e.ctrlKey || e.metaKey;
    const noAudio: boolean | string = (NO_AUDIO as any)[e.which] || isMeta;
    const isPressed = this.pressedKeys[e.code];

    if (isPressed) {
      return false;
    }

    if (!noAudio) {
      this.pressedKeys[e.code] = true;

      if (e.key === 'Enter') {
        newlineAudio.play();
      } else {
        keypressAudio.play();
      }
      return true;
    }

    if (noAudio === 'TAB') {
      // refocus
      window.setTimeout(() => {
        textInput.focus();
      }, 10);
      e.preventDefault();
    }

    return true;
  };

  handleKeyPress = (e: KeyboardEvent) => {
    const isMeta = e.altKey || e.ctrlKey || e.metaKey;
    const disable = e.key === 'Tab' || e.key === 'Enter';

    if (disable || isMeta) {
      e.preventDefault();
    }

    return !disable;
  };

  /**
   * keyup handles character input and navigation
   * @param {KeyboardEvent} e
   */
  handleKeyUp = (e: KeyboardEvent) => {
    const { key, code } = e;
    const ignoreKey = key === 'Shift';
    const isMeta = e.altKey || e.ctrlKey || e.metaKey;

    if (ignoreKey) {
      return;
    }

    if (this.pressedKeys[code]) {
      delete this.pressedKeys[code];
    }

    if (isMeta) {
      // ignore if user is refreshing or navigating or something
      this.emptyText();

      return;
    }

    const { typewriter } = this;
    // TODO: add test for first character being set
    // ignores first character, which should always be a single character
    const letters = textInput.value.substr(1);

    // Handle Enter specially for RTL support
    if (key === 'Enter') {
      typewriter.handleNewline();
    } else {
      const nav = typewriter.cursor.navButtons[key];
      if (nav) {
        nav();
      } else if (letters) {
        typewriter.addCharacter(letters);
      }
    }

    this.emptyText();
    // android needs to blur to remove autocomplete double-type
    textInput.blur();
    this.focusText();
  };

  handleFocus = () => {
    this.focusText();
  };

  mouseuptimeout?: number;

  mouseDownStartPos: Vector | null = null;

  /**
   * handleMouseDown
   * @param {MouseEvent} e
   */
  handleMouseDown = (e: MouseEvent | TouchEvent) => {
    // TODO: add menu somehow somewhere
    // ignore right click
    if ('button' in e && e.button === 2) return;

    // mousemove would be expensive, so we add it only after the mouse is down
    this.mouseuptimeout = window.setTimeout(() => {
      this.mouseDownStartPos = getPositionFromEvent(e);

      eventTarget.addEventListener('touchmove', this.handleMouseMove);
      eventTarget.addEventListener('mousemove', this.handleMouseMove);
    }, this.mousemovedelay);
  };

  /**
   * handleTouchStart
   * @param {TouchEvent} e
   */
  handleTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.touches && e.touches.length === 2) {
      // todo: work on zooming
      // (https://codepen.io/bozdoz/pen/xxEmJyx?editors=0011)

      return true;
    }

    return this.handleMouseDown(e);
  };

  /**
   * handleMouseMove
   * @param {MouseEvent} e
   */
  handleMouseMove = (e: MouseEvent | TouchEvent) => {
    // probably prevents browser zoom
    e.preventDefault();
    e.stopPropagation();

    if (!this.mouseDownStartPos) {
      return;
    }

    const _position = getPositionFromEvent(e)._subtract(this.mouseDownStartPos);

    // fake canvas moving by cheaply altering css
    positionElem(container, _position);

    this.typewriter.cursor.clear();
  };

  /**
   * handleMouseUp
   * @param {MouseEvent} e
   */
  handleMouseUp = (e: MouseEvent | TouchEvent) => {
    const rightClick = 'button' in e && e.button === 2;
    const stillTouches = 'touches' in e && e.touches.length > 0;

    if (rightClick || stillTouches) return;

    this.removeMoveEvent();

    const position = getPositionFromEvent(e);

    if (this.mouseDownStartPos) {
      // reposition canvas if mouse moved
      position._subtract(this.mouseDownStartPos);

      this.typewriter.reposition(position);
      this.mouseDownStartPos = null;
    } else {
      // act as if it were just a click handler
      this.updateCursor(position);
    }
  };

  /**
   * Updates cursor to a given position
   * @param {Vector} position
   */
  updateCursor = (position: Vector) => {
    this.typewriter.cursor.moveToClick(position);
    this.focusText();
  };

  removeMoveEvent = () => {
    window.clearTimeout(this.mouseuptimeout);
    eventTarget.removeEventListener('touchmove', this.handleMouseMove);
    eventTarget.removeEventListener('mousemove', this.handleMouseMove);
  };

  emptyText = () => {
    // sets value to empty first to adjust for cursor location
    textInput.value = '';
    // leaves a character to disable automatic ProperCase in mobile
    textInput.value = '=';
  };

  focusText = () => {
    textInput.focus();
    // TODO: reposition canvas to quasi-center textInput
  };
}

export default App;
