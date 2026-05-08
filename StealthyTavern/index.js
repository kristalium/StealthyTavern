import { POPUP_RESULT, POPUP_TYPE, Popup } from '../../../popup.js';

// ---------- Extension asset path ----------
// import.meta.url is the absolute URL of this file as served by ST's static server,
// e.g. http://localhost:8000/scripts/extensions/StealthyTavern/index.js
// new URL() resolves sibling paths correctly regardless of hostname / port / install location.
const BUNDLED_FAVICON = new URL('./icons/kix-favicon-2023q4.ico', import.meta.url).href;

// ---------- In-line popup HTML ----------
const settingsHTML = `
<div class="flex-container flexFlowColumn" style="gap: 16px; padding: 4px 0;">
    <h3 style="margin: 0;">StealthyTavern</h3>

    <div class="flex-container flexFlowColumn" style="gap: 12px;">

        <div class="flex-container flexFlowColumn" style="gap: 4px;">
            <label for="stealthTitle">Browser tab title</label>
            <input id="stealthTitle" type="text" class="text_pole" placeholder="Google Docs">
        </div>

        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="stealthImageSuppression">
            Hide all images
        </label>

        <div class="flex-container flexFlowColumn" style="gap: 4px;">
            <label>Tab icon</label>
            <div class="flex-container flexFlowRow" style="align-items: center; gap: 6px;">
                <input id="stealthFaviconURL" type="text" class="text_pole" placeholder="https://… or paste a data URL">
                <span style="white-space: nowrap;">or</span>
                <button id="stealthFaviconFileButton" class="menu_button" style="white-space: nowrap;">Upload file</button>
                <input id="stealthFaviconFile" type="file" accept="image/*" style="display: none;">
            </div>
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                <img id="stealthFaviconPreview" style="width: 32px; height: 32px; object-fit: contain; display: none; border-radius: 4px;">
                <button id="stealthFaviconDefault" class="menu_button">Restore defaults</button>
                <button id="stealthFaviconClear" class="menu_button" style="display: none;">Clear icon</button>
            </div>
        </div>

    </div>
</div>`;

// ---------- Default settings ----------
const DEFAULT_SETTINGS = {
    title: 'Google Docs',
    imageSuppression: false,
    favicon: BUNDLED_FAVICON,
};

// ---------- State ----------
let settings = { ...DEFAULT_SETTINGS };
let imageObserver = null;
let titleObserver = null;

const originalTitle = document.title;
let originalFaviconClone = null;

// ---------- Load / save settings ----------
function loadSettings() {
    try {
        const stored = localStorage.getItem('stealthSettings');
        if (stored) {
            settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(stored));
        }
    } catch (e) {
        console.error('StealthyTavern: failed to load settings', e);
    }
}

function saveSettings() {
    localStorage.setItem('stealthSettings', JSON.stringify(settings));
}

// ---------- Title masking ----------
function applyTitleMask() {
    const newTitle = settings.title || DEFAULT_SETTINGS.title;
    document.title = newTitle;

    if (titleObserver) titleObserver.disconnect();
    const titleElement = document.querySelector('title');
    if (titleElement) {
        titleObserver = new MutationObserver(() => {
            if (document.title !== newTitle) document.title = newTitle;
        });
        titleObserver.observe(titleElement, { childList: true, characterData: true, subtree: true });
    }
}

// ---------- Image suppression ----------
function applyImageSuppression(enable) {
    if (enable) {
        document.querySelectorAll('img').forEach(img => img.classList.add('stealth-suppressed'));

        if (!imageObserver) {
            imageObserver = new MutationObserver(mutations => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.tagName === 'IMG') {
                            node.classList.add('stealth-suppressed');
                        } else if (node.querySelectorAll) {
                            node.querySelectorAll('img').forEach(img => img.classList.add('stealth-suppressed'));
                        }
                    }
                    if (mutation.type === 'attributes' && mutation.target.tagName === 'IMG') {
                        mutation.target.classList.add('stealth-suppressed');
                    }
                }
            });
            imageObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src', 'srcset'],
            });
        }

        if (!document.getElementById('stealth-img-style')) {
            const style = document.createElement('style');
            style.id = 'stealth-img-style';
            style.textContent = 'img.stealth-suppressed { visibility: hidden !important; }';
            document.head.appendChild(style);
        }
    } else {
        if (imageObserver) {
            imageObserver.disconnect();
            imageObserver = null;
        }
        document.getElementById('stealth-img-style')?.remove();
        document.querySelectorAll('img.stealth-suppressed').forEach(img => img.classList.remove('stealth-suppressed'));
    }
}

// ---------- Favicon ----------
function captureOriginalFavicon() {
    const link = document.querySelector("link[rel*='icon']");
    if (link) originalFaviconClone = link.cloneNode(true);
}

function removeAllFavicons() {
    document.querySelectorAll("link[rel*='icon']").forEach(link => link.remove());
}

function applyFavicon(value) {
    removeAllFavicons();

    if (!value) {
        if (originalFaviconClone) document.head.appendChild(originalFaviconClone.cloneNode(true));
        return;
    }

    const link = document.createElement('link');
    link.rel = 'icon';
    link.id = 'stealth-favicon';
    if (value.startsWith('data:image/')) {
        link.type = value.match(/^data:(image\/\w+);/)?.[1] ?? 'image/png';
    }
    link.href = value;
    document.head.appendChild(link);
}

// ---------- Apply all ----------
function applyAllSettings() {
    applyTitleMask();
    applyImageSuppression(settings.imageSuppression);
    applyFavicon(settings.favicon);
}

// ---------- Popup ----------
async function openSettingsPopup() {
    const template = $(settingsHTML);

    const titleInput       = template.find('#stealthTitle');
    const imageSuppression = template.find('#stealthImageSuppression');
    const faviconURL       = template.find('#stealthFaviconURL');
    const faviconFileBtn   = template.find('#stealthFaviconFileButton');
    const faviconFile      = template.find('#stealthFaviconFile');
    const faviconPreview   = template.find('#stealthFaviconPreview');
    const faviconDefault   = template.find('#stealthFaviconDefault');
    const faviconClear     = template.find('#stealthFaviconClear');

    // Populate with saved settings
    titleInput.val(settings.title);
    imageSuppression.prop('checked', settings.imageSuppression);

    if (settings.favicon) {
        faviconPreview.attr('src', settings.favicon).show();
        faviconClear.show();
        if (settings.favicon.startsWith('data:')) {
            // Data URL: keep field empty, stash value internally
            faviconURL.attr('placeholder', 'Uploaded file').data('pendingDataUrl', settings.favicon);
        } else if (settings.favicon === BUNDLED_FAVICON) {
            // Bundled default: keep field empty, stash resolved URL internally
            faviconURL.attr('placeholder', 'Default icon').data('resolvedFavicon', BUNDLED_FAVICON);
        } else {
            // Regular external URL: show it in the field as normal
            faviconURL.val(settings.favicon);
        }
    }

    // URL field typed manually — clear any internal stash since user is taking over
    faviconURL.on('input', () => {
        faviconURL.removeData('pendingDataUrl').removeData('resolvedFavicon');
        const val = faviconURL.val().trim();
        if (val) {
            faviconPreview.attr('src', val).show();
            faviconFile.val('');
            faviconClear.show();
        } else {
            faviconPreview.hide();
            faviconClear.hide();
        }
    });

    faviconFileBtn.on('click', () => faviconFile.trigger('click'));

    // File upload
    faviconFile.on('change', () => {
        const file = faviconFile[0].files[0];
        if (!file) return;

        if (file.size > 200 * 1024) {
            toastr.warning('Image too large — use a file under 200 KB or paste a URL.');
            faviconFile.val('');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            faviconURL.val('').attr('placeholder', file.name)
                .removeData('resolvedFavicon').data('pendingDataUrl', dataUrl);
            faviconPreview.attr('src', dataUrl).show();
            faviconClear.show();
        };
        reader.readAsDataURL(file);
    });

    // Restore bundled default
    faviconDefault.on('click', () => {
        faviconFile.val('');
		titleInput.val(DEFAULT_SETTINGS.title);
        faviconURL.val('').attr('placeholder', 'Default icon')
            .removeData('pendingDataUrl').data('resolvedFavicon', BUNDLED_FAVICON);
        faviconPreview.attr('src', BUNDLED_FAVICON).show();
        faviconClear.show();
    });

    // Clear icon entirely (falls back to ST's own favicon on save)
    faviconClear.on('click', () => {
        faviconFile.val('');
        faviconURL.val('').attr('placeholder', 'https://… or paste a data URL')
            .removeData('pendingDataUrl').removeData('resolvedFavicon');
        faviconPreview.hide();
        faviconClear.hide();
    });

    const popup = new Popup(template, POPUP_TYPE.CONFIRM, '', {
        wide: false,
        large: false,
        okButton: 'Save',
        cancelButton: 'Cancel',
    });
    const result = await popup.show();

    if (result) {
        settings.title = titleInput.val().trim() || DEFAULT_SETTINGS.title;
        settings.imageSuppression = imageSuppression.is(':checked');

        // Resolution order: uploaded data URL > bundled/default URL > typed URL > null (restore ST favicon)
        settings.favicon =
            faviconURL.data('pendingDataUrl') ||
            faviconURL.data('resolvedFavicon') ||
            faviconURL.val().trim() ||
            null;

        saveSettings();
        applyAllSettings();
        toastr.success('StealthyTavern settings saved.');
    }
}

// ---------- Menu button ----------
function addLaunchButton() {
    const extensionsMenu = document.getElementById('extensionsMenu');
    if (!extensionsMenu) {
        console.error('StealthyTavern: #extensionsMenu not found');
        return;
    }

    const button = document.createElement('div');
    button.id = 'stealthMenuButton';
    button.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
    button.tabIndex = 0;
    button.title = 'StealthyTavern';

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-eye-slash';

    const label = document.createElement('span');
    label.textContent = 'StealthyTavern';

    button.append(icon, label);
    extensionsMenu.appendChild(button);
    button.addEventListener('click', openSettingsPopup);
}

// ---------- Init ----------
(function init() {
    loadSettings();
    captureOriginalFavicon();
    addLaunchButton();
    applyAllSettings();
})();