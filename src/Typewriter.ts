import Vector from './utils/Vector';
import {
  Cursor,
  getRightMargin,
  getLeftMargin,
  getLetterWidth,
} from './Cursor';
import { Character } from './Character';
import { container, cursorCtx, textCtx } from './helpers/getElements';
import debounce from './utils/debounce';
import positionElem from './utils/positionElem';

const FONT_SIZE = 26;
const TEXT_COLOR = '#150904';
const CURSOR_COLOR = '#4787ea';
const GLOBAL_ALPHA = 0.72;

/**
 * Checks if a character is Hebrew (RTL)
 * Hebrew Unicode range: U+0590 to U+05FF
 */
const isHebrewChar = (char: string): boolean => {
  const code = char.charCodeAt(0);
  return code >= 0x0590 && code <= 0x05ff;
};
const letterSize = parseInt(
  String(Math.min(FONT_SIZE, window.innerWidth / 17)),
  10
);

interface TypeWriterClass {
  canvasOffset: Vector;
  containerScale: number;
  chars: Character[];
  isRTLMode: boolean;
  addCharacter(_chars: string): void;
  handleNewline(): void;
  redraw(): void;
  resetCanvases(): void;
  reposition(vec?: Vector | UIEvent): void;
  debouncedReposition(this: unknown, vec?: Vector | UIEvent): void;
  reset(): void;
  cursor: Cursor;
  export(): string;
  import(str: string): void;
}

export class TypeWriter implements TypeWriterClass {
  static _instance: TypeWriterClass;

  canvasOffset = new Vector(0, 0);

  containerScale = 1;

  chars: Character[] = [];

  cursor = new Cursor();

  /** Tracks if we're currently in RTL mode (for newline behavior) */
  isRTLMode = false;

  constructor() {
    if (TypeWriter._instance) {
      return TypeWriter._instance;
    }

    TypeWriter._instance = this;

    // add events
    window.addEventListener('resize', this.debouncedReposition);
  }

  addCharacter = (_chars: string, _x?: number, _y?: number): void => {
    // manually set position and update cursor
    if (_x !== undefined && _y !== undefined) {
      this.chars.push(new Character(this, _chars, _x, _y));
      this.cursor.update(new Vector(_x, _y));
      return;
    }
    // iterate characters and move cursor (right for LTR, left for RTL like Hebrew)
    for (let i = 0, len = _chars.length; i < len; i += 1) {
      const char = _chars[i];
      const isRTL = isHebrewChar(char);
      const wasRTL = this.isRTLMode;

      // Update RTL mode based on character type
      this.isRTLMode = isRTL;

      // If switching to RTL and cursor is near left margin, jump to right margin
      const leftMargin = getLeftMargin();
      const letterWidth = getLetterWidth();
      if (
        isRTL &&
        !wasRTL &&
        this.cursor.position.x <= leftMargin + letterWidth * 2
      ) {
        this.cursor.update(
          new Vector(getRightMargin(), this.cursor.position.y)
        );
      }

      // If switching to LTR and cursor is near right margin, jump to left margin
      const rightMargin = getRightMargin();
      if (
        !isRTL &&
        wasRTL &&
        this.cursor.position.x >= rightMargin - letterWidth * 2
      ) {
        this.cursor.update(new Vector(leftMargin, this.cursor.position.y));
      }

      const {
        position: { x, y },
      } = this.cursor;

      // Place character at current cursor position
      this.chars.push(new Character(this, char, x, y));

      // Move cursor: left for RTL, right for LTR
      if (isRTL) {
        this.cursor.moveleft();
      } else {
        this.cursor.moveright();
      }
    }
  };

  /** Handle newline - respects current RTL mode */
  handleNewline = (): void => {
    if (this.isRTLMode) {
      this.cursor.newlineRTL();
    } else {
      this.cursor.newline();
    }
  };

  redraw = (): void => {
    this.chars.forEach((char) => char.draw());
  };

  resetCanvases = (): void => {
    [textCtx, cursorCtx].forEach((ctx) => {
      const { canvas } = ctx;
      const { devicePixelRatio = 1, innerWidth, innerHeight } = window;

      ctx.setTransform(1, 0, 0, 1, 0, 0);

      canvas.width = innerWidth * devicePixelRatio;
      canvas.height = innerHeight * devicePixelRatio;
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;

      ctx.scale(devicePixelRatio, devicePixelRatio);

      ctx.globalAlpha = GLOBAL_ALPHA;
    });

    // reset contexts, because resizing wipes them
    textCtx.font = `${letterSize}px Special Elite, serif`;
    textCtx.textBaseline = 'top';
    textCtx.fillStyle = TEXT_COLOR;

    cursorCtx.fillStyle = CURSOR_COLOR;
    cursorCtx.scale(this.containerScale, this.containerScale);
  };

  /**
   * offset characters for given x/y
   * useful for moving/dragging
   * useful for redrawing (b/c needs resetting)
   */
  reposition = (vec?: Vector | UIEvent): void => {
    if (vec instanceof Vector) {
      this.canvasOffset._add(vec);
    }

    positionElem(container, { x: 0, y: 0 });

    this.resetCanvases();
    this.redraw();
  };

  debouncedReposition = debounce(this.reposition, 100);

  /**
   * back to original blank canvas
   */
  reset = () => {
    this.chars = [];
    this.cursor.reset();
    this.canvasOffset = new Vector(0, 0);
    this.containerScale = 1;
    container.setAttribute('style', '');

    this.reposition();
    this.cursor.draw();
  };

  export() {
    // just save x,y,str and re-instantiate classes in import
    return JSON.stringify(
      this.chars.map(({ x, y, s }: Character) => ({ x, y, s }))
    );
  }

  import(str: string) {
    try {
      const chars: Pick<Character, 'x' | 'y' | 's'>[] = JSON.parse(str);

      if (!Array.isArray(chars)) {
        return;
      }

      this.reset();

      for (const { s, x, y } of chars) {
        this.addCharacter(s, x, y);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('failed to import');
    }
  }
}
