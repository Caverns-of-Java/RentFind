/* ===========================
   CONFIGURATION
   =========================== */
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycby-87ppuNRo1ryH28copMoxKHwTpNF1_9gMr1ziRYpzB70TDVuIZgmEu8D7SF8NH4Hd/exec'
};

const AUTH_CONFIG = {
    SESSION_KEY: 'rentfind_auth_unlocked',
    PASSWORD_HASH_SHA256: '21eb478c997305f06e5e0d043d3ec5acc63a85938da69e14f239f34a8348fc54'
};

const GEOCODE_CACHE_KEY = 'rentfind_detail_geocode_cache_v1';
const GEOCODE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ===========================
   APP STATE
   =========================== */
const appState = {
    items: [],
    selectedItem: null,
    isLoading: false,
    error: null,
    viewMode: 'default',
    isAddCardOpen: false,
    isSubmittingAdd: false,
    addCardError: null,
    addCardMode: 'add',
    editingItemId: null,
    isAuthenticated: false
};

const mapState = {
    instance: null,
    requestId: 0
};

// Tracks the list of YYYYMMDDTHHMM strings for the multi datetime picker in the add/edit form.
let inspectTimes = [];

/* ===========================
   DOM REFERENCES
   =========================== */
const dom = {
    appRoot: document.getElementById('appRoot'),

    // Auth gate
    authOverlay: document.getElementById('authOverlay'),
    authForm: document.getElementById('authForm'),
    authPasswordInput: document.getElementById('authPasswordInput'),
    authError: document.getElementById('authError'),

    // State regions
    statusRegion: document.querySelector('.status-region'),
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    emptyState: document.getElementById('emptyState'),
    errorMessage: document.getElementById('errorMessage'),
    retryButton: document.getElementById('retryButton'),

    // List view
    contentWrapper: document.querySelector('.content-wrapper'),
    listView: document.getElementById('listView'),
    itemList: document.getElementById('itemList'),
    viewModeRadios: Array.from(document.querySelectorAll('input[name="viewMode"]')),

    // Detail panel
    detailPanel: document.getElementById('detailPanel'),
    detailContent: document.getElementById('detailContent'),
    closeDetailButton: document.getElementById('closeDetailButton'),
    openDetailUrlButton: document.getElementById('openDetailUrlButton'),
    openMapButton: document.getElementById('openMapButton'),

    // Add card popup
    addCardOverlay: document.getElementById('addCardOverlay'),
    addCardTitle: document.getElementById('addCardTitle'),
    addListingForm: document.getElementById('addListingForm'),
    addId: document.getElementById('addId'),
    dismissAddCardButton: document.getElementById('dismissAddCardButton'),
    cancelAddCardButton: document.getElementById('cancelAddCardButton'),
    submitAddCardButton: document.getElementById('submitAddCardButton'),
    addCardError: document.getElementById('addCardError'),

    // Edit action
    editDetailButton: document.getElementById('editDetailButton'),

    // App title
    appTitle: document.getElementById('appTitle')
};

/* ===========================
   STATE MANAGEMENT
   =========================== */

/**
 * Update app state and trigger UI re-render
 */
function updateAppState(updates) {
    Object.assign(appState, updates);
    render();
}

/**
 * Show state: loading
 */
function setLoadingState() {
    updateAppState({ isLoading: true, error: null });
}

/**
 * Show state: error
 */
function setErrorState(message) {
    updateAppState({ isLoading: false, error: message });
}

/**
 * Show state: success
 */
function setSuccessState(items) {
    updateAppState({ isLoading: false, error: null, items });
}

/**
 * Select an item and open detail panel
 */
function selectItem(item) {
    updateAppState({ selectedItem: item });
    dom.detailPanel.classList.remove('hidden');
}

/**
 * Deselect item and close detail panel
 */
function deselectItem() {
    updateAppState({ selectedItem: null });
    dom.detailPanel.classList.add('hidden');
}

/* ===========================
   RENDERING
   =========================== */

/**
 * Main render function - reflects app state to UI
 */
function render() {
    renderHeaderControls();
    renderStateRegion();
    renderListView();
    renderAddCardOverlay();

    if (appState.selectedItem && !getVisibleItems().includes(appState.selectedItem)) {
        appState.selectedItem = null;
    }

    renderDetailPanel();
}

/**
 * Sync header toggles with app state.
 */
function renderHeaderControls() {
    dom.viewModeRadios.forEach((radio) => {
        radio.checked = radio.value === appState.viewMode;
    });
}

/**
 * Render loading/error/empty states
 */
function renderStateRegion() {
    dom.statusRegion.classList.remove('hidden');

    // Hide all state boxes first
    dom.loadingState.classList.add('hidden');
    dom.errorState.classList.add('hidden');
    dom.emptyState.classList.add('hidden');

    const currentView = getCurrentView();

    if (appState.isLoading) {
        dom.loadingState.classList.remove('hidden');
    } else if (appState.error) {
        dom.errorMessage.textContent = appState.error;
        dom.errorState.classList.remove('hidden');
    } else if (getVisibleItems().length === 0 && currentView !== 'default') {
        dom.emptyState.classList.remove('hidden');
    } else {
        dom.statusRegion.classList.add('hidden');
    }
}

/**
 * Render list of items
 */
function renderListView() {
    const visibleItems = getVisibleItems();
    const currentView = getCurrentView();
    const shouldForceDefaultList = currentView === 'default';

    if (appState.isLoading) {
        dom.listView.classList.add('hidden');
        return;
    }

    // In Default view, keep list visible so the Upcoming add button is always available.
    if (appState.error && !shouldForceDefaultList) {
        dom.listView.classList.add('hidden');
        return;
    }

    if (visibleItems.length === 0 && currentView !== 'default') {
        dom.listView.classList.add('hidden');
        return;
    }

    dom.listView.classList.remove('hidden');
    dom.itemList.innerHTML = '';

    if (currentView === 'planned') {
        const sections = buildUpcomingAndShortlistSections(visibleItems);
        renderSection('Upcoming', sections.next, 'next-section');
        renderSection('Shortlist', sections.shortlist, 'upcoming-section');
        return;
    }

    if (currentView === 'archive') {
        const archivedItems = [...visibleItems].sort((a, b) => getNumericId(b) - getNumericId(a));
        renderSection('Archive', archivedItems, 'closed-section');
        return;
    }

    const sections = buildUpcomingAndShortlistSections(visibleItems);
    renderSection('Upcoming', sections.next, 'next-section');
    renderSection('Shortlist', sections.shortlist, 'upcoming-section');
}

/**
 * Build Upcoming and Shortlist sections from a source list.
 */
function buildUpcomingAndShortlistSections(items) {
    const now = new Date();
    const weekAhead = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
    const sections = {
        next: [],
        shortlist: []
    };

    items.forEach((item) => {
        // Parse inspection time to find upcoming
        const inspectTime = getNextInspectionTime(item.DateInspectTime);
        if (inspectTime) {
            if (inspectTime > now && inspectTime <= weekAhead) {
                sections.next.push(item);
            } else {
                // Past inspections and >7 day inspections remain in shortlist.
                sections.shortlist.push(item);
            }
        } else {
            sections.shortlist.push(item);
        }
    });

    sections.next.sort((a, b) => compareShortlistItems(a, b));

    sections.shortlist.sort((a, b) => compareShortlistItems(a, b));
    return sections;
}

/**
 * Determine active list view from header toggles.
 */
function getCurrentView() {
    return appState.viewMode;
}

/**
 * Return items visible in the current view.
 */
function getVisibleItems() {
    const currentView = getCurrentView();

    if (currentView === 'planned') {
        return appState.items.filter((item) => isPlannedInspectionStatus(item));
    }

    if (currentView === 'archive') {
        return appState.items.filter((item) => isArchivedStatus(item));
    }

    return appState.items.filter((item) => !isArchivedStatus(item));
}

function normalizeStatus(status) {
    return String(status || '').trim().toLowerCase();
}

function getNormalizedStatus(input) {
    if (input && typeof input === 'object') {
        if (typeof input._statusNormalized === 'string') {
            return input._statusNormalized;
        }
        return normalizeStatus(input.Status);
    }

    return normalizeStatus(input);
}

function isClosedStatus(status) {
    return getNormalizedStatus(status) === 'closed';
}

function isArchivedStatus(status) {
    const normalized = getNormalizedStatus(status);
    return normalized === 'closed' || normalized === 'declined';
}

function isPlannedInspectionStatus(status) {
    return getNormalizedStatus(status) === 'planned inspection';
}

/**
 * Parse DateInspectTime into sorted Date objects.
 */
function parseInspectionTimes(dateTimeStr) {
    if (!dateTimeStr || typeof dateTimeStr !== 'string') return [];

    return dateTimeStr
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length === 13 && part[8] === 'T')
        .map((rawValue) => {
            const year = rawValue.substring(0, 4);
            const month = rawValue.substring(4, 6);
            const day = rawValue.substring(6, 8);
            const hour = rawValue.substring(9, 11);
            const minute = rawValue.substring(11, 13);
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
        })
        .sort((a, b) => a - b);
}

/**
 * Parse DateInspectTime and return the earliest upcoming inspection Date object.
 */
function getNextInspectionTime(dateTimeStr) {
    const parsed = parseInspectionTimes(dateTimeStr);
    if (parsed.length === 0) return null;

    const now = new Date();
    const nextUpcoming = parsed.find((inspectTime) => inspectTime > now);
    return nextUpcoming || parsed[0];
}

/**
 * Sort shortlist items by status priority and id.
 */
function compareShortlistItems(a, b) {
    const statusPriorityA = getShortlistStatusPriority(a.Status);
    const statusPriorityB = getShortlistStatusPriority(b.Status);

    if (statusPriorityA !== statusPriorityB) {
        return statusPriorityA - statusPriorityB;
    }

    // Planned Inspection entries are ordered by inspection date first.
    if (statusPriorityA === 0) {
        const timeA = getNextInspectionTime(a.DateInspectTime);
        const timeB = getNextInspectionTime(b.DateInspectTime);

        if (timeA && timeB && timeA.getTime() !== timeB.getTime()) {
            return timeA - timeB;
        }
        if (timeA && !timeB) return -1;
        if (!timeA && timeB) return 1;
    }

    return getNumericId(b) - getNumericId(a);
}

/**
 * Priority order for shortlist statuses.
 */
function getShortlistStatusPriority(status) {
    const normalizedStatus = normalizeStatus(status);

    if (normalizedStatus === 'planned inspection') return 0;
    return 1;
}

/**
 * Normalize id for consistent numeric descending comparisons.
 */
function getNumericId(item) {
    const rawId = item && (item.Id ?? item.id);
    const parsedId = Number(rawId);
    return Number.isFinite(parsedId) ? parsedId : -Infinity;
}

/**
 * Render a section with title and cards
 */
function renderSection(title, items, sectionClass) {
    const shouldShowAddButton = title === 'Upcoming' && getCurrentView() === 'default';
    if (items.length === 0 && !shouldShowAddButton) return;

    const sectionDiv = document.createElement('div');
    sectionDiv.className = `list-section ${sectionClass}`;

    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'list-section-header';

    const sectionTitle = document.createElement('h2');
    sectionTitle.className = 'list-section-title';
    sectionTitle.textContent = title;
    sectionHeader.appendChild(sectionTitle);

    if (shouldShowAddButton) {
        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'upcoming-add-button';
        addButton.setAttribute('aria-label', 'Add upcoming listing');
        addButton.setAttribute('title', 'Add upcoming listing');
        addButton.innerHTML = '<span aria-hidden="true">+</span>';
        addButton.addEventListener('click', (event) => {
            event.stopPropagation();
            openAddCard();
        });
        sectionHeader.appendChild(addButton);
    }

    const sectionList = document.createElement('ul');
    sectionList.className = 'section-item-list';

    items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'item-card';
        if (appState.selectedItem === item) {
            li.classList.add('active');
        }

        // Build title from suburb and address
        const parts = [];
        if (item.Suburb) parts.push(item.Suburb);
        if (item.Address) parts.push(item.Address);
        const name = parts.length > 0 ? parts.join(' - ') : 'Untitled';
        const fieldsHtml = Object.entries(item)
            .filter(([key]) => {
                const normalizedKey = key.toLowerCase();
                return !normalizedKey.startsWith('_')
                    && normalizedKey !== 'id'
                    && normalizedKey !== 'address'
                    && normalizedKey !== 'suburb'
                    && normalizedKey !== 'url';
            })
            .filter(([, value]) => value !== null && value !== undefined && value !== '')
            .map(([key, value]) => {
                const label = formatFieldLabel(key);
                const displayValue = formatItemValue(key, value);

                // Check if this is a past inspection time and apply strikethrough
                let fieldValueClass = 'item-field-value';
                if (key === 'DateInspectTime') {
                    const inspectTime = getNextInspectionTime(value);
                    if (inspectTime && inspectTime < new Date()) {
                        fieldValueClass += ' past-inspection';
                    }
                }

                return `
                    <div class="item-field-row">
                        <span class="item-field-label">${escapeHtml(label)}</span>
                        <span class="${fieldValueClass}">${escapeHtml(displayValue)}</span>
                    </div>
                `;
            })
            .join('');

        li.innerHTML = `
            <div class="item-name">${escapeHtml(name)}</div>
            <div class="item-fields">${fieldsHtml}</div>
        `;

        li.addEventListener('click', () => selectItem(item));
        sectionList.appendChild(li);
    });

    sectionDiv.appendChild(sectionHeader);
    sectionDiv.appendChild(sectionList);
    dom.itemList.appendChild(sectionDiv);
}

/**
 * Reflect add-card popup state.
 */
function renderAddCardOverlay() {
    if (!dom.addCardOverlay) return;

    const isOpen = appState.isAddCardOpen;

    dom.addCardOverlay.classList.toggle('hidden', !isOpen);
    dom.addCardOverlay.setAttribute('aria-hidden', String(!isOpen));

    if (appState.addCardError) {
        dom.addCardError.textContent = appState.addCardError;
        dom.addCardError.classList.remove('hidden');
    } else {
        dom.addCardError.textContent = '';
        dom.addCardError.classList.add('hidden');
    }

    const submitting = appState.isSubmittingAdd;
    const isEditMode = appState.addCardMode === 'edit';

    dom.addCardTitle.textContent = isEditMode ? 'Edit listing' : 'Add upcoming';
    dom.submitAddCardButton.disabled = submitting;
    dom.submitAddCardButton.textContent = submitting ? 'Submitting...' : (isEditMode ? 'Save' : 'Submit');
    dom.dismissAddCardButton.disabled = submitting;
    dom.cancelAddCardButton.disabled = submitting;
}

/**
 * Render detail panel for selected item
 */
function renderDetailPanel() {
    if (!appState.selectedItem) {
        clearDetailMap();
        dom.detailPanel.classList.add('hidden');
        dom.contentWrapper.classList.remove('detail-open');
        dom.openDetailUrlButton.classList.add('hidden');
        dom.openDetailUrlButton.setAttribute('href', '#');
        dom.openMapButton.classList.add('hidden');
        dom.openMapButton.setAttribute('href', '#');
        return;
    }

    dom.detailPanel.classList.remove('hidden');
    dom.contentWrapper.classList.add('detail-open');
    const item = appState.selectedItem;
        dom.editDetailButton.classList.remove('hidden');

    const itemUrl = getItemUrl(item);
    const mapUrl = getOpenStreetMapSearchUrl(item);

    if (mapUrl) {
        dom.openMapButton.classList.remove('hidden');
        dom.openMapButton.setAttribute('href', mapUrl);
    } else {
        dom.openMapButton.classList.add('hidden');
        dom.openMapButton.setAttribute('href', '#');
    }

    if (itemUrl) {
        dom.openDetailUrlButton.classList.remove('hidden');
        dom.openDetailUrlButton.setAttribute('href', itemUrl);
        dom.detailContent.innerHTML = `
            <div class="iframe-wrapper">
                <iframe
                    id="detailListingFrame"
                    class="detail-iframe"
                    title="Listing preview"
                    loading="lazy"
                    referrerpolicy="no-referrer"
                ></iframe>
            </div>
            <div id="iframeFallback" class="iframe-fallback hidden">
                <p>This listing cannot be embedded here.</p>
                <a class="open-tab-icon" href="${escapeHtml(itemUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open listing in new tab" title="Open in new tab">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-box-arrow-up-right" viewBox="0 0 16 16" aria-hidden="true">
                      <path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5"/>
                      <path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0z"/>
                    </svg>
                    <span class="sr-only">Open in new tab</span>
                </a>
            </div>
            <div class="detail-map-section">
                <div id="detailMap" class="detail-map" role="region" aria-label="Listing map"></div>
                <p id="mapStatus" class="map-status">Loading map...</p>
            </div>
        `;

        const iframe = document.getElementById('detailListingFrame');
        const fallback = document.getElementById('iframeFallback');
        let resolved = false;

        const showFallback = () => {
            if (resolved) return;
            resolved = true;
            fallback.classList.remove('hidden');
        };

        const loadTimeout = window.setTimeout(showFallback, 3000);

        iframe.addEventListener('load', () => {
            if (resolved) return;
            resolved = true;
            window.clearTimeout(loadTimeout);
            fallback.classList.add('hidden');
        });

        iframe.addEventListener('error', () => {
            window.clearTimeout(loadTimeout);
            showFallback();
        });

        iframe.src = itemUrl;
        renderItemMap(item);
        return;
    }

    dom.openDetailUrlButton.classList.add('hidden');
    dom.openDetailUrlButton.setAttribute('href', '#');
    dom.detailContent.innerHTML = `
        <p>No URL available for this listing.</p>
        <div class="detail-map-section">
            <div id="detailMap" class="detail-map" role="region" aria-label="Listing map"></div>
            <p id="mapStatus" class="map-status">Loading map...</p>
        </div>
    `;
    renderItemMap(item);
}

/**
 * Convert camelCase/snake_case to Title Case
 */
function formatFieldLabel(key) {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .trim();
}

/**
 * Parse DateInspectTime values from YYYYMMDDTHHMM to DD/MM/YY HH:MM.
 */
function formatInspectTimes(dateTimeStr) {
    if (!dateTimeStr || typeof dateTimeStr !== 'string') return '';

    const parsed = dateTimeStr
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((rawValue) => {
            if (rawValue.length !== 13 || rawValue[8] !== 'T') {
                return rawValue;
            }

            const year = rawValue.substring(0, 4);
            const month = rawValue.substring(4, 6);
            const day = rawValue.substring(6, 8);
            const hour = rawValue.substring(9, 11);
            const minute = rawValue.substring(11, 13);

            // Create Date to get weekday
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
            const weekday = WEEKDAY_NAMES[date.getDay()];

            return `(${weekday}) ${day}/${month}/${year.substring(2)} ${hour}:${minute}`;
        });

    return parsed.join('\n');
}

/**
 * Format display values for known fields.
 */
function formatItemValue(key, value) {
    if (key.toLowerCase() === 'dateinspecttime') {
        return formatInspectTimes(String(value)) || String(value);
    }

    if (key.toLowerCase() === 'perweek') {
        const weeklyAmount = Number(value);
        if (Number.isFinite(weeklyAmount)) {
            const monthlyAmount = Math.round((weeklyAmount * 52) / 12);
            const weeklyText = formatCurrencyAmount(weeklyAmount);
            const monthlyText = formatCurrencyAmount(monthlyAmount);
            return `$${weeklyText}/week ($${monthlyText}/month)`;
        }

        return `$${value}/week`;
    }

    if (typeof value === 'object') {
        return JSON.stringify(value);
    }

    return String(value);
}

/**
 * Resolve URL field from API item.
 */
function getItemUrl(item) {
    const rawUrl = item.URL || item.Url || item.url || '';
    if (typeof rawUrl !== 'string') {
        return '';
    }

    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl) {
        return '';
    }

    if (!/^https?:\/\//i.test(trimmedUrl)) {
        return '';
    }

    return trimmedUrl;
}

/**
 * Build OpenStreetMap search URL from address and suburb fields.
 */
function getOpenStreetMapSearchUrl(item) {
    const query = buildLocationQuery(item);

    if (!query) {
        return '';
    }

    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
}

function getLocationQuery(item) {
    return buildLocationQuery(item);
}

function buildLocationQuery(item) {
    const address = (item.Address || item.address || '').toString().trim();
    const suburb = (item.Suburb || item.suburb || '').toString().trim();
    return [address, suburb].filter(Boolean).join(', ');
}

function clearDetailMap() {
    mapState.requestId += 1;
    if (!mapState.instance) return;
    mapState.instance.remove();
    mapState.instance = null;
}

async function geocodeAddress(query) {
    const cached = getCachedGeocode(query);
    if (cached) {
        return cached;
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
        headers: {
            Accept: 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Geocode failed: ${response.status}`);
    }

    const results = await response.json();
    if (!Array.isArray(results) || results.length === 0) {
        return null;
    }

    const first = results[0];
    const lat = Number(first.lat);
    const lng = Number(first.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    const geocode = {
        lat,
        lng,
        label: first.display_name || query
    };

    setCachedGeocode(query, geocode);
    return geocode;
}

function getCachedGeocode(query) {
    if (!query) return null;

    const cache = loadGeocodeCache();
    const entry = cache[query];
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const isExpired = !Number.isFinite(entry.cachedAt) || (Date.now() - entry.cachedAt > GEOCODE_CACHE_TTL_MS);
    if (isExpired) {
        delete cache[query];
        saveGeocodeCache(cache);
        return null;
    }

    if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lng)) {
        return null;
    }

    return {
        lat: entry.lat,
        lng: entry.lng,
        label: entry.label || query
    };
}

function setCachedGeocode(query, value) {
    if (!query || !value) return;

    const cache = loadGeocodeCache();
    cache[query] = {
        lat: value.lat,
        lng: value.lng,
        label: value.label,
        cachedAt: Date.now()
    };
    saveGeocodeCache(cache);
}

function loadGeocodeCache() {
    try {
        const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }
        return parsed;
    } catch (error) {
        return {};
    }
}

function saveGeocodeCache(cache) {
    try {
        localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        // Ignore storage write failures.
    }
}

function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation unavailable'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            (error) => reject(error),
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 30000
            }
        );
    });
}

async function renderItemMap(item) {
    const mapContainer = document.getElementById('detailMap');
    const mapStatus = document.getElementById('mapStatus');

    if (!mapContainer || !mapStatus) return;

    if (typeof L === 'undefined') {
        mapStatus.textContent = 'Map library failed to load.';
        return;
    }

    const query = getLocationQuery(item);
    if (!query) {
        mapStatus.textContent = 'No address available to locate this listing.';
        return;
    }

    const requestId = mapState.requestId + 1;
    clearDetailMap();
    mapState.requestId = requestId;
    mapStatus.textContent = 'Searching address on OpenStreetMap...';

    let listingLocation;
    try {
        listingLocation = await geocodeAddress(query);
    } catch (error) {
        mapStatus.textContent = 'Unable to look up this address right now.';
        return;
    }

    if (mapState.requestId !== requestId) {
        return;
    }

    if (!listingLocation) {
        mapStatus.textContent = 'Address was not found in OpenStreetMap search.';
        return;
    }

    const map = L.map(mapContainer).setView([listingLocation.lat, listingLocation.lng], 15);
    mapState.instance = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    L.marker([listingLocation.lat, listingLocation.lng])
        .addTo(map)
        .bindPopup(`Listing: ${escapeHtml(listingLocation.label)}`)
        .openPopup();

    const bounds = [[listingLocation.lat, listingLocation.lng]];

    try {
        mapStatus.textContent = 'Listing shown. Finding your current location...';
        const userLocation = await getUserLocation();

        if (mapState.requestId !== requestId || !mapState.instance) {
            return;
        }

        L.circleMarker([userLocation.lat, userLocation.lng], {
            radius: 8,
            color: '#1d4ed8',
            fillColor: '#3b82f6',
            fillOpacity: 0.85,
            weight: 2
        })
            .addTo(map)
            .bindPopup('Your current location');

        bounds.push([userLocation.lat, userLocation.lng]);
        map.fitBounds(bounds, { padding: [30, 30] });
        mapStatus.textContent = 'Showing listing and your current location.';
    } catch (error) {
        mapStatus.textContent = 'Showing listing location. Allow location access to show your current point.';
    }

    window.setTimeout(() => {
        if (mapState.instance) {
            mapState.instance.invalidateSize();
        }
    }, 0);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatCurrencyAmount(amount) {
    return Number(amount).toLocaleString('en-AU', {
        maximumFractionDigits: 0
    });
}

async function sha256Hex(value) {
    if (!window.crypto || !window.crypto.subtle || typeof TextEncoder === 'undefined') {
        throw new Error('Secure hash API is unavailable in this browser.');
    }

    const bytes = new TextEncoder().encode(String(value));
    const buffer = await window.crypto.subtle.digest('SHA-256', bytes);
    const view = new Uint8Array(buffer);
    return Array.from(view)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

function showAuthError(message) {
    if (!dom.authError) return;

    if (!message) {
        dom.authError.textContent = '';
        dom.authError.classList.add('hidden');
        return;
    }

    dom.authError.textContent = message;
    dom.authError.classList.remove('hidden');
}

function setAuthUnlocked(isUnlocked) {
    if (isUnlocked) {
        sessionStorage.setItem(AUTH_CONFIG.SESSION_KEY, '1');
    } else {
        sessionStorage.removeItem(AUTH_CONFIG.SESSION_KEY);
    }
}

function isAuthUnlocked() {
    return sessionStorage.getItem(AUTH_CONFIG.SESSION_KEY) === '1';
}

function lockApp() {
    setAuthUnlocked(false);
    updateAppState({
        isAuthenticated: false,
        selectedItem: null
    });
    closeAddCard();
    clearDetailMap();

    if (dom.appRoot) {
        dom.appRoot.classList.add('hidden');
    }

    if (dom.authOverlay) {
        dom.authOverlay.classList.remove('hidden');
    }

    showAuthError('');
    if (dom.authPasswordInput) {
        dom.authPasswordInput.value = '';
        dom.authPasswordInput.focus();
    }
}

function unlockApp() {
    setAuthUnlocked(true);
    updateAppState({ isAuthenticated: true });

    if (dom.appRoot) {
        dom.appRoot.classList.remove('hidden');
    }

    if (dom.authOverlay) {
        dom.authOverlay.classList.add('hidden');
    }

    showAuthError('');
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    if (!dom.authPasswordInput) return;

    const enteredValue = dom.authPasswordInput.value.trim();
    if (!enteredValue) {
        showAuthError('Enter password to continue.');
        return;
    }

    try {
        const enteredHash = await sha256Hex(enteredValue);
        if (enteredHash !== AUTH_CONFIG.PASSWORD_HASH_SHA256) {
            showAuthError('Incorrect password.');
            return;
        }

        unlockApp();
        fetchData();
    } catch (error) {
        showAuthError(error.message || 'Unable to verify password.');
    }
}

async function initializeAuthState() {
    if (isAuthUnlocked()) {
        unlockApp();
        await fetchData();
        return;
    }

    lockApp();
}

function normalizeItem(item) {
    return {
        ...item,
        _statusNormalized: normalizeStatus(item.Status)
    };
}

function openAddCard() {
    if (!dom.addListingForm) return;

    dom.addListingForm.reset();
    inspectTimes = [];
    renderInspectTimeList();
    if (dom.addId) {
        dom.addId.value = getNextIdValue();
    }

    syncInspectTimeRequired();

    updateAppState({
        isAddCardOpen: true,
        addCardError: null,
        addCardMode: 'add',
        editingItemId: null
    });
}

function openEditCard(item) {
    if (!item || !dom.addListingForm) return;

    const itemId = String(item.Id ?? item.id ?? '').trim();

    document.getElementById('addSuburb').value = item.Suburb || '';
    document.getElementById('addAddress').value = item.Address || '';
    document.getElementById('addPerWeek').value = item.PerWeek || '';
    inspectTimes = (item.DateInspectTime || '').split(',').map((t) => t.trim()).filter(Boolean);
    renderInspectTimeList();
    document.getElementById('addStatus').value = item.Status || 'Inquired';
    const typeEl = document.getElementById('addType');
    if (typeEl) {
        const incomingType = String(item.Type || item.type || '').trim();
        const validTypes = ['Unit', 'House', 'Townhouse', 'Apartment'];
        typeEl.value = validTypes.includes(incomingType) ? incomingType : 'Unit';
    }
    const agentEl = document.getElementById('addAgent');
    if (agentEl) {
        agentEl.value = item.Agent || item.agent || '';
    }
    document.getElementById('addUrl').value = item.URL || item.Url || item.url || '';
    const noteEl = document.getElementById('addNote');
    if (noteEl) {
        noteEl.value = item.Notes || item.Note || item.notes || item.note || '';
    }
    if (dom.addId) {
        dom.addId.value = itemId;
    }

    syncInspectTimeRequired();

    updateAppState({
        isAddCardOpen: true,
        addCardError: null,
        addCardMode: 'edit',
        editingItemId: itemId || null
    });
}

function closeAddCard() {
    updateAppState({
        isAddCardOpen: false,
        isSubmittingAdd: false,
        addCardError: null,
        addCardMode: 'add',
        editingItemId: null
    });

    if (dom.addListingForm) {
        dom.addListingForm.reset();
        inspectTimes = [];
        renderInspectTimeList();
    }
}

function buildAddListingPayload(formData) {
    const formId = String(formData.get('listingId') || '').trim();

    const payload = {
        Id: formId,
        id: formId,
        Suburb: String(formData.get('listingSuburb') || '').trim(),
        Address: String(formData.get('listingAddress') || '').trim(),
        PerWeek: String(formData.get('listingPerWeek') || '').trim(),
        DateInspectTime: String(formData.get('listingDateInspectTime') || '').trim(),
        Status: String(formData.get('listingStatus') || '').trim() || 'Planned Inspection',
        Type: String(formData.get('listingType') || '').trim() || 'Unit',
        Agent: String(formData.get('listingAgent') || '').trim(),
        URL: String(formData.get('listingUrl') || '').trim(),
        Notes: String(formData.get('listingNote') || '').trim(),
        Note: String(formData.get('listingNote') || '').trim()
    };

    return payload;
}

function validateAddListingPayload(payload) {
    if (!payload.Id) {
        return 'Id is missing. Close and reopen the form.';
    }

    const isPlanned = normalizeStatus(payload.Status) === 'planned inspection';

    if (!payload.Suburb || !payload.Address || !payload.PerWeek) {
        return 'Please complete all required fields.';
    }

    if (isPlanned && !payload.DateInspectTime) {
        return 'Inspection time is required for Planned Inspection.';
    }

    if (payload.DateInspectTime) {
        const inspectPattern = /^\d{8}T\d{4}(\s*,\s*\d{8}T\d{4})*$/;
        if (!inspectPattern.test(payload.DateInspectTime)) {
            return 'Inspection time must use YYYYMMDDTHHMM format.';
        }
    }

    if (payload.URL && !/^https?:\/\//i.test(payload.URL)) {
        return 'Listing URL must start with http:// or https://';
    }

    const validTypes = ['Unit', 'House', 'Townhouse', 'Apartment'];
    if (!validTypes.includes(payload.Type)) {
        return 'Type must be one of: Unit, House, Townhouse, Apartment.';
    }

    return null;
}

function syncInspectTimeRequired() {
    const statusEl = document.getElementById('addStatus');
    const dateEl = document.getElementById('addDateInspectTime');
    if (!statusEl || !dateEl) return;
    dateEl.required = normalizeStatus(statusEl.value) === 'planned inspection';
}

/**
 * Convert a datetime-local input value (YYYY-MM-DDTHH:MM) to stored format (YYYYMMDDTHHMM).
 */
function datetimeLocalToStored(val) {
    if (!val || val.length < 16) return null;
    const tIdx = val.indexOf('T');
    if (tIdx < 0) return null;
    const datePart = val.substring(0, tIdx).replace(/-/g, '');
    const timePart = val.substring(tIdx + 1, tIdx + 6).replace(':', '');
    if (datePart.length !== 8 || timePart.length !== 4) return null;
    return `${datePart}T${timePart}`;
}

/**
 * Re-render the inspect times list UI and sync the hidden input.
 */
function renderInspectTimeList() {
    const listEl = document.getElementById('addDateInspectList');
    const hiddenEl = document.getElementById('addDateInspectTime');
    if (!listEl || !hiddenEl) return;

    listEl.innerHTML = '';
    inspectTimes.forEach((t, i) => {
        const li = document.createElement('li');
        li.className = 'inspect-time-item';
        const span = document.createElement('span');
        span.textContent = formatInspectTimes(t) || t;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'inspect-time-remove';
        btn.setAttribute('aria-label', 'Remove inspection time');
        btn.dataset.index = String(i);
        btn.textContent = '×';
        li.appendChild(span);
        li.appendChild(btn);
        listEl.appendChild(li);
    });

    hiddenEl.value = inspectTimes.join(',');
}

function getNextIdValue() {
    const maxId = appState.items.reduce((acc, item) => {
        const parsedId = Number(item && (item.Id ?? item.id));
        if (!Number.isFinite(parsedId)) return acc;
        return Math.max(acc, parsedId);
    }, 0);

    return String(maxId + 1).padStart(3, '0');
}

async function submitAddListing(event) {
    event.preventDefault();

    const formData = new FormData(dom.addListingForm);
    const payload = buildAddListingPayload(formData);
    const isEditMode = appState.addCardMode === 'edit';

    if (isEditMode) {
        payload.Id = String(appState.editingItemId || payload.Id || payload.id || '');
        payload.id = payload.Id;
        payload._action = 'update';
    } else {
        payload.Id = payload.Id || getNextIdValue();
        payload.id = payload.Id;
        payload._action = 'add';
    }

    const validationError = validateAddListingPayload(payload);

    if (validationError) {
        updateAppState({ addCardError: validationError });
        return;
    }

    updateAppState({
        isSubmittingAdd: true,
        addCardError: null
    });

    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        if (isEditMode) {
            const editedId = String(payload.Id || payload.id);
            appState.items = appState.items.map((item) => {
                if (String(item && (item.Id ?? item.id)) !== editedId) {
                    return item;
                }

                return {
                    ...item,
                    ...payload,
                    _action: undefined
                };
            });
        }

        closeAddCard();
        await fetchData();
    } catch (err) {
        console.error('Add listing error:', err);
        updateAppState({
            isSubmittingAdd: false,
            addCardError: `Unable to save listing: ${err.message}`
        });
    }
}

/* ===========================
   API FETCHING
   =========================== */

/**
 * Fetch data from API
 */
async function fetchData() {
    if (!appState.isAuthenticated) {
        return;
    }

    setLoadingState();

    try {
        const response = await fetch(CONFIG.API_URL);

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Validate response is array
        if (!Array.isArray(data)) {
            throw new Error('API response is not an array');
        }

        setSuccessState(data.map((item) => normalizeItem(item)));
    } catch (err) {
        console.error('Fetch error:', err);
        setErrorState(`Error: ${err.message}`);
    }
}

/* ===========================
   EVENT LISTENERS
   =========================== */

/**
 * Setup event listeners
 */
function setupEventListeners() {
    dom.retryButton.addEventListener('click', fetchData);
    dom.closeDetailButton.addEventListener('click', deselectItem);

    if (dom.appTitle) {
        dom.appTitle.addEventListener('click', () => {
            updateAppState({ viewMode: 'default' });
            fetchData();
        });
    }

    const addStatusEl = document.getElementById('addStatus');
    if (addStatusEl) {
        addStatusEl.addEventListener('change', syncInspectTimeRequired);
    }

    if (dom.editDetailButton) {
        dom.editDetailButton.addEventListener('click', () => {
            if (!appState.selectedItem) return;
            openEditCard(appState.selectedItem);
        });
    }

    dom.viewModeRadios.forEach((radio) => {
        radio.addEventListener('change', (event) => {
            if (!event.target.checked) return;
            updateAppState({
                viewMode: event.target.value
            });
        });
    });

    if (dom.addListingForm) {
        dom.addListingForm.addEventListener('submit', submitAddListing);
    }

    const addInspectTimeBtn = document.getElementById('addDateInspectTimeAddBtn');
    if (addInspectTimeBtn) {
        addInspectTimeBtn.addEventListener('click', () => {
            const picker = document.getElementById('addDateInspectTimePicker');
            if (!picker || !picker.value) return;
            const stored = datetimeLocalToStored(picker.value);
            if (stored && !inspectTimes.includes(stored)) {
                inspectTimes.push(stored);
                renderInspectTimeList();
            }
            picker.value = '';
        });
    }

    const inspectTimeList = document.getElementById('addDateInspectList');
    if (inspectTimeList) {
        inspectTimeList.addEventListener('click', (event) => {
            const btn = event.target.closest('.inspect-time-remove');
            if (!btn) return;
            const idx = parseInt(btn.dataset.index, 10);
            if (!isNaN(idx) && idx >= 0 && idx < inspectTimes.length) {
                inspectTimes.splice(idx, 1);
                renderInspectTimeList();
            }
        });
    }

    if (dom.dismissAddCardButton) {
        dom.dismissAddCardButton.addEventListener('click', closeAddCard);
    }

    if (dom.cancelAddCardButton) {
        dom.cancelAddCardButton.addEventListener('click', closeAddCard);
    }

    if (dom.addCardOverlay) {
        dom.addCardOverlay.addEventListener('click', (event) => {
            if (event.target === dom.addCardOverlay && !appState.isSubmittingAdd) {
                closeAddCard();
            }
        });
    }

    if (dom.authForm) {
        dom.authForm.addEventListener('submit', handleAuthSubmit);
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && appState.isAddCardOpen && !appState.isSubmittingAdd) {
            closeAddCard();
        }
    });
}

/* ===========================
   INITIALIZATION
   =========================== */

/**
 * Initialize app on DOM ready
 */
function init() {
    console.log('App initialized');
    setupEventListeners();
    initializeAuthState();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
