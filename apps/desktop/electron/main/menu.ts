import { Menu, app, shell } from 'electron';

/**
 * Native application menu. Keeps standard roles (quit, edit, view, window, help) so the
 * desktop feels native, plus a Help -> Learn more entry that opens our site externally.
 * No custom privileged actions are exposed here.
 */
export function buildApplicationMenu(): Menu {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? ([{ type: 'separator' }, { role: 'front' }] as Electron.MenuItemConstructorOptions[])
          : ([{ role: 'close' }] as Electron.MenuItemConstructorOptions[])),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn more about Cue',
          click: async () => {
            // Only fixed, trusted URLs reach shell.openExternal from the menu.
            await shell.openExternal('https://buildtogether.app');
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
