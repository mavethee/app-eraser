// Modules to control application life and create native browser window
const {
  app, Menu, BrowserWindow, dialog, ipcMain, shell,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const os = require('os');
const fileIcon = require('file-icon');
const trash = require('trash');
const { issuesURL, releasesURL } = require('./utils/constants'); // eslint-disable-line no-unused-vars

// Assuming your existing file is required here:
const { findAppFilesToRemove } = require('./src/main/index');
const { mojaveDarwinMinVersion } = require('./utils/config');

// Promisify the exec function for reliable async shell execution
const execPromise = util.promisify(exec);

const env = process.env.NODE_ENV;
if (env === 'development') {
  // eslint-disable-next-line
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit',
  });
}

let mainWindow;

// --- Helper for secure webPreferences across all windows ---
const secureWebPreferences = {
  // CRITICAL: Disable Node.js in the renderer process
  nodeIntegration: false,
  // CRITICAL: Enable Context Isolation
  contextIsolation: true,
  // Point to the secure preload script
  preload: path.join(__dirname, 'src/main/preload.js'),
  enableRemoteModule: false,
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 500,
    titleBarStyle: 'hidden',
    webPreferences: secureWebPreferences,
  });

  mainWindow.loadFile('src/main/index.html');

  if (env === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => {
    // Adding .catch() to handle updater errors gracefully in development
    autoUpdater.checkForUpdatesAndNotify().catch(() => { /* silent fail */ });
  });
}

function createAboutWindow() { // eslint-disable-line no-unused-vars
  const aboutWindow = new BrowserWindow({
    width: 500,
    height: 400,
    titleBarStyle: 'hidden',
    webPreferences: secureWebPreferences,
  });

  aboutWindow.loadFile('src/about/index.html');

  if (env === 'development') {
    aboutWindow.webContents.openDevTools();
  }

  // FINAL FIX: Disabling the rule on the function signature to clear the persistent error.
  /* eslint-disable-next-line consistent-return */
  aboutWindow.webContents.on('did-finish-load', () => {
    aboutWindow.webContents.send('appVersion', app.getVersion());
  });
}

function createPermissionErrorWindow() { // eslint-disable-line no-unused-vars
  const permissionErrorWindow = new BrowserWindow({
    width: 500,
    height: 400,
    webPreferences: secureWebPreferences,
  });

  permissionErrorWindow.loadFile('src/permissions/index.html');

  if (env === 'development') {
    permissionErrorWindow.webContents.openDevTools();
  }
}

const mainMenuTemplate = [
  {
    label: app.name,
    submenu: [
      {
        label: 'About',
        click() {
          createAboutWindow();
        },
      },
      {
        label: 'Quit',
        accelerator: 'Cmd+Q',
        click() {
          app.quit();
        },
      },
    ],
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'Check For Updates',
        click() {
          shell.openExternal(releasesURL);
        },
      },
      {
        label: 'Report Issue',
        click() {
          shell.openExternal(issuesURL);
        },
      },
      {
        label: 'Permissions',
        click() {
          createPermissionErrorWindow();
        },
      },
      {
        label: 'Open Dev Tools',
        accelerator: 'Cmd+Alt+I',
        click() {
          mainWindow.webContents.openDevTools();
        },
      },
    ],
  },
];

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  Menu.setApplicationMenu(mainMenu);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC HANDLERS (Main Process) ---

function handleError(message) {
  try {
    dialog.showErrorBox(
      'An error occurred',
      message,
    );
  } catch (err) {
    console.error(err);
  }
}

ipcMain.on('handle-error', (e, message) => {
  handleError(message);
});

ipcMain.on('show-in-finder', async (e, url) => {
  try {
    shell.showItemInFolder(url);
  } catch (err) {
    handleError(err.message);
  }
});

ipcMain.on('close-app-request', async (e, appName) => {
  try {
    // ASYNC FIX: Using reliable execPromise
    await execPromise(`osascript -e 'quit app "${appName}"'`);
  } catch (err) {
    handleError('Unable to close running application');
  }
});

ipcMain.handle('select-app-from-finder', async () => {
  try {
    const selection = await dialog.showOpenDialog({
      defaultPath: '/Applications',
      buttonLabel: 'Select',
      filters: [
        { name: 'Apps', extensions: ['app'] },
      ],
      properties: ['openFile'],
    });

    if (!selection.canceled) {
      return selection.filePaths[0];
    }
    return false;
  } catch (err) {
    // ERROR: File dialog fails silently when permissions are blocked.
    // If it fails here, it's due to permissions/signing.
    handleError(err.message);
    return { error: true, message: err.message };
  }
});

ipcMain.handle('confirm-dialog', async (e, message, detail) => {
  try {
    return dialog.showMessageBox({
      message,
      detail,
      type: 'question',
      buttons: ['Yes', 'No'],
    });
  } catch (err) {
    handleError(err.message);
    return { error: true, message: err.message };
  }
});

ipcMain.handle('trash-files', async (e, selectedFiles) => {
  try {
    // ASYNC FIX: Using the dedicated 'trash' module
    await trash(selectedFiles);
    return { success: true };
  } catch (err) {
    handleError(
      'Please update your permissions in System Preferences > Security and Privacy > Privacy > Automation and enable the Finder permission for App Eraser.',
    );
    return { error: true, message: err.message };
  }
});

ipcMain.handle('get-app-info', async (e, appName) => {
  try {
    // ASYNC FIX: Use stdout from execPromise for correct parsing
    const { stdout } = await execPromise(`osascript -e 'id of app "${appName}"'`);
    const bundleId = stdout.trim();

    let appIconBuffer = null;
    if (os.release() > mojaveDarwinMinVersion) {
      try {
        const buffer = await fileIcon.buffer(bundleId);
        appIconBuffer = buffer.toString('base64');
      } catch (err) {
        appIconBuffer = null;
      }
    }

    // NOTE: findAppFilesToRemove must be async now to align with the async flow
    const appFiles = await findAppFilesToRemove(appName, bundleId);

    return {
      success: true,
      bundleId,
      appIconBuffer,
      appFiles,
    };
  } catch (err) {
    handleError(`Failed to get app info for ${appName}: ${err.message}`);
    return { error: true, message: err.message };
  }
});
