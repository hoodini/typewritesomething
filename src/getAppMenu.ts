import Menu from './Menu';
import * as Storage from './Storage';
import Dialog from './Dialog';
import SavedList from './SavedList';
import { textCanvas } from './helpers/getElements';

/**
 * Exports the typewriter canvas as a vintage paper image
 */
const exportAsVintageImage = () => {
  const { width, height } = textCanvas;

  // Create a new canvas for the export
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width;
  exportCanvas.height = height;
  const ctx = exportCanvas.getContext('2d')!;

  // Draw vintage paper background
  // Base color - aged paper
  ctx.fillStyle = '#f4e4c9';
  ctx.fillRect(0, 0, width, height);

  // Add subtle texture/noise for aged paper effect
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 20;
    data[i] = Math.min(255, Math.max(0, data[i] + noise)); // R
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise - 5)); // G
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise - 10)); // B
  }
  ctx.putImageData(imageData, 0, 0);

  // Add slight vignette effect (darker edges)
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    Math.max(width, height) / 1.5
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Add some coffee stain / age spots (subtle)
  for (let i = 0; i < 3; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = 20 + Math.random() * 40;
    const spotGradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    spotGradient.addColorStop(0, 'rgba(139, 90, 43, 0.08)');
    spotGradient.addColorStop(1, 'rgba(139, 90, 43, 0)');
    ctx.fillStyle = spotGradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Draw the text canvas on top
  ctx.drawImage(textCanvas, 0, 0);

  // Export as PNG and trigger download
  const link = document.createElement('a');
  link.download = `typewriter-${Date.now()}.png`;
  link.href = exportCanvas.toDataURL('image/png');
  link.click();
};

const menuEvent = (event: string) => {
  window.gtag('event', event, {
    event_category: 'menu',
  });
};

const getAppMenu = (app: import('./App').default) => {
  const menu = new Menu();

  let lastLoadedId: ReturnType<typeof Storage.create>;

  menu.addMenuItem('📃 &nbsp; New', {
    callback: () => {
      lastLoadedId = '';
      menu.closeMenu();
      app.reset();
      menuEvent('menu:new');
    },
  });

  menu.addMenuItem('💾 &nbsp; Save', {
    // TODO: maybe should export all of these callbacks for testing
    callback: () => {
      // save and prompt edit modal
      const exported = app.typewriter.export();

      if (exported === '[]') {
        // empty should not be saved
        menu.closeMenu();
        menuEvent('menu:save:empty');
        return;
      }

      const id = lastLoadedId || Storage.create(exported);
      let submit = 'Save Writing';
      let cancel = 'Delete';

      if (lastLoadedId) {
        submit = 'Update Writing';
        cancel = 'Discard Changes';
      }

      const [item] = Storage.getDataById(id);

      menu.closeMenu();

      new Dialog('Save', { submit, cancel })
        .addInput('Name', {
          type: 'text',
          name: 'name',
          value: item?.name,
        })
        .onSubmit(({ name }) => {
          if (!name) {
            // TODO: should return validation errors
            return false;
          }

          if (lastLoadedId) {
            // actually update
            Storage.updateWriting(lastLoadedId, exported);
          }

          Storage.update(id, {
            name,
          });

          menuEvent('menu:save:success');

          return true;
        })
        .onCancel(() => {
          // TODO: make sure you can't exit from clicking the backdrop
          if (!lastLoadedId) {
            // newly created should delete the writing
            Storage.deleteById(id);
          }
          menuEvent('menu:save:cancel');
        })
        .open();
    },
  });

  menu.addMenuItem('👀 &nbsp; View Saved', {
    callback: () => {
      menu.closeMenu();

      menuEvent('menu:view-saved');

      const savedList = new SavedList('Saved Writings');
      savedList
        .onClick(({ key }) => {
          const writing = Storage.get(key);

          if (writing) {
            app.typewriter.import(writing);
            // handle save as if it may be update instead
            lastLoadedId = key;
            menuEvent('menu:view-saved:view');
          } else {
            // empty writings got no reason to live
            Storage.deleteById(key);
            menuEvent('menu:view-saved:delete-empty');
          }
        })
        .onDelete(({ key }) => {
          Storage.deleteById(key);
          // refresh list
          savedList.refreshList();

          menuEvent('menu:view-saved:delete');
        })
        .onEdit(({ name, key }) => {
          new Dialog('Update', { submit: 'Update Writing' })
            .addInput('Name', {
              type: 'text',
              name: 'name',
              value: name,
            })
            .onSubmit<{ name: string }>(({ name: newName }) => {
              if (!newName) {
                // TODO: should return validation errors
                return false;
              }

              Storage.update(key, {
                name: newName,
              });

              savedList.refreshList();

              menuEvent('menu:view-saved:edit');

              return true;
            })
            .open();
        })
        .onClose(() => {
          app.focusText();
          app.typewriter.cursor.draw();
        })
        .open();
    },
  });

  menu.addMenuItem('📋 &nbsp; Paste Text', {
    callback: () => {
      const pasteDialog = new Dialog('Paste Text');

      menu.closeMenu();

      menuEvent('menu:paste-text');

      pasteDialog
        .addTextArea('Text', {
          name: 'content',
        })
        .onSubmit<{ content: string }>(({ content }) => {
          const lines = content.split(/[\r\n]/);
          const { typewriter } = app;

          typewriter.reset();

          for (const line of lines) {
            typewriter.addCharacter(line);
            typewriter.handleNewline();
          }
        })
        .open();
    },
  });

  menu.addMenuItem('📷 &nbsp; Export as Image', {
    callback: () => {
      menu.closeMenu();
      exportAsVintageImage();
      menuEvent('menu:export-image');
    },
  });

  menu.addDivider();

  menu.addMenuItem('🙋‍♀️ &nbsp; App Feedback', {
    href: 'https://github.com/bozdoz/typewritesomething/issues/new',
  });

  menu.addMenuItem('🥰 &nbsp; Sponsor Me', {
    href: 'https://www.paypal.com/paypalme/bozdoz',
  });

  return menu;
};

export default getAppMenu;
