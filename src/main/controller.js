// Modules available in the secure Renderer context
const path = require('path');

// Global API exposed by the preload script
const { api } = window;

// --- Constants ---
const FILE_ITEM_CLASS = 'fileItem';
const HANDLE_ERROR_CHANNEL = 'handle-error';

// --- UI Elements (Updated for max-len compliance) ---
const dropZone = document.getElementById('drag-drop-zone');
const dropZoneText = document.getElementById('drag-drop-zone-text');
const dropZoneImage = document.getElementById('drag-drop-zone-image');
const fileList = document.getElementById('files-list');
const deleteButton = document.getElementById('delete-button');
const clearButton = document.getElementById('clear-button');
const loadingContainer = document.getElementById('loading-container');
const filesHeaderSubtitle = document.getElementById('files-header-subtitle');

const filesImage = '../../assets/img/files.svg';
const addFileImage = '../../assets/img/add_files.svg';

let globAppName = '';

const isValidApp = (appPath) => path.extname(appPath) === '.app';

const getSelectedFiles = () => [...document.querySelectorAll('input[name=checkbox]:checked')].map(
  (item) => item.value,
);

const removeChildren = (parent) => {
  while (parent.lastChild) {
    parent.removeChild(parent.lastChild);
  }
};

function clearList() {
  removeChildren(fileList);
  dropZoneText.innerHTML = 'Drag and Drop App Here';
  filesHeaderSubtitle.innerHTML = 'Related Files';
  dropZoneImage.src = addFileImage;
  deleteButton.disabled = true;
}

// SECURE: Now sends a request to the Main Process
function closeRunningApplication() {
  api.send('close-app-request', globAppName);
}

// SECURE: Now handles trashing files via invoke
async function moveFilesToTrash() {
  const selectedFiles = getSelectedFiles();
  closeRunningApplication(); // Send request to close app

  const confirmDialogResp = await api.invoke(
    'confirm-dialog',
    'Are you sure?',
    `${selectedFiles.length} files will be moved to trash`,
  );

  if (confirmDialogResp.response === 0) {
    try {
      const response = await api.invoke('trash-files', selectedFiles);
      if (response.success) {
        clearList();
      } else if (response.error) {
        api.send(HANDLE_ERROR_CHANNEL, response.message);
      }
    } catch (err) {
      api.send(HANDLE_ERROR_CHANNEL, err.message);
    }
  }
}

function appNameFromPath(appPath) {
  const pathArr = appPath.split('/');
  const appNameWithExt = pathArr[pathArr.length - 1];
  return appNameWithExt.replace('.app', '');
}

// SECURE: Command sent to Main Process to use shell.showItemInFolder
function openInFinder(filePath) {
  api.send('show-in-finder', filePath);
}

function listItem(filePath, index) { // eslint-disable-line no-unused-vars
  const isEven = index % 2 === 0;
  const div = document.createElement('div');
  if (isEven) {
    div.classList.add(FILE_ITEM_CLASS);
    div.classList.add('fileItem1');
  } else {
    div.classList.add(FILE_ITEM_CLASS);
    div.classList.add('fileItem2');
  }

  // create checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'checkbox';
  checkbox.name = 'checkbox';
  checkbox.value = filePath;
  checkbox.checked = true;
  checkbox.style.display = 'inline-block';

  const appNameLabel = document.createElement('p');
  appNameLabel.classList.add(`${FILE_ITEM_CLASS}AppName`);

  const filePathLabel = document.createElement('label');
  filePathLabel.htmlFor = 'checkbox';
  filePathLabel.classList.add(`${FILE_ITEM_CLASS}PathLabel`);

  appNameLabel.appendChild(document.createTextNode(filePath.split('/').slice(-1)));
  filePathLabel.appendChild(document.createTextNode(filePath.split('/').slice(0, -1).join('/')));

  const viewInFinderBtn = document.createElement('a');
  viewInFinderBtn.addEventListener('click', () => openInFinder(filePath));
  viewInFinderBtn.style.float = 'right';
  viewInFinderBtn.classList.add('fa-regular');
  viewInFinderBtn.classList.add('fa-folder-open');

  div.append(checkbox);
  div.append(appNameLabel);
  div.append(viewInFinderBtn);
  div.append(document.createElement('br'));
  div.append(filePathLabel);
  fileList.appendChild(div);
}

async function appSelectionHandler(appPath) {
  loadingContainer.style.display = 'flex';
  clearList();
  if (isValidApp(appPath)) {
    globAppName = appNameFromPath(appPath);

    // SECURE: Fetch all required info from Main Process in one consolidated request
    const appInfo = await api.invoke('get-app-info', globAppName);
    if (appInfo.error) {
      api.send(HANDLE_ERROR_CHANNEL, appInfo.message);
      loadingContainer.style.display = 'none';
      return;
    }

    const { appIconBuffer, appFiles } = appInfo;

    if (appIconBuffer) {
      dropZoneImage.src = `data:image/png;base64,${appIconBuffer}`;
    } else {
      dropZoneImage.src = filesImage;
    }

    appFiles.forEach((filePath, i) => {
      listItem(filePath, i);
    });

    dropZoneText.innerHTML = `${globAppName}`;
    filesHeaderSubtitle.innerHTML = `${appFiles.length} Files Found`;
    clearButton.style.display = 'block';
    deleteButton.disabled = false;
  } else {
    api.send(HANDLE_ERROR_CHANNEL, 'Selected file is not a valid app');
  }
  loadingContainer.style.display = 'none';
}

async function openAppSelector() {
  loadingContainer.style.display = 'flex';
  // SECURE: Invoke dialog.showOpenDialog via the secure bridge
  const selectedApp = await api.invoke('select-app-from-finder');

  if (selectedApp && !selectedApp.error) appSelectionHandler(selectedApp);
  else loadingContainer.style.display = 'none';
}

deleteButton.addEventListener('click', async () => {
  moveFilesToTrash();
});

clearButton.addEventListener('click', () => {
  clearList();
});

// FIX 1: Click handler for opening the file dialog
// Wrapping the function call ensures the correct asynchronous execution context is preserved.
dropZone.addEventListener('click', () => openAppSelector());

// FIX 2: Implement the drop listener to rely on the window message from preload
dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  event.stopPropagation();
  // The path is captured by preload.js and sent via window.postMessage;
  // we handle the logic in the window message listener below.
});

// --- CRITICAL D&D FIX: Listener for secure file path message ---
window.addEventListener('message', (event) => {
  // SECURITY CHECK: Only process messages from the expected origin (local file)
  if (event.origin !== window.location.origin) return;

  // Check if the message contains the file path data
  if (event.data.type === 'dropped-file-path') {
    const filePath = event.data.detail;
    if (filePath) {
      appSelectionHandler(filePath);
    }
  }
});
