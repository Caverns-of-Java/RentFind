const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycby-87ppuNRo1ryH28copMoxKHwTpNF1_9gMr1ziRYpzB70TDVuIZgmEu8D7SF8NH4Hd/exec'
};

const state = {
    map: null,
    markersLayer: null,
    userMarker: null,
    plannedItems: [],
    todayOnly: false,
    geocodeCache: loadGeocodeCache(),
    geocodeRequestToken: 0
};

const dom = {
    mapStatus: document.getElementById('mapStatus'),
    todayOnlyToggle: document.getElementById('todayOnlyToggle')
};

function init() {
    if (typeof L === 'undefined') {
        setStatus('Leaflet failed to load.');
        return;
    }

    setupMap();
    setupEvents();
    fetchAndRender();
}

function setupMap() {
    state.map = L.map('inspectionMap').setView([-33.8688, 151.2093], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);

    state.markersLayer = L.layerGroup().addTo(state.map);

    window.setTimeout(() => {
        if (state.map) {
            state.map.invalidateSize();
        }
    }, 0);
}

function setupEvents() {
    if (!dom.todayOnlyToggle) return;

    dom.todayOnlyToggle.addEventListener('change', (event) => {
        state.todayOnly = event.target.checked;
        renderInspectionMarkers();
    });
}

async function fetchAndRender() {
    setStatus('Loading planned inspections...');

    try {
        const response = await fetch(CONFIG.API_URL);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const items = await response.json();
        if (!Array.isArray(items)) {
            throw new Error('Unexpected API response format.');
        }

        state.plannedItems = items.filter((item) => isPlannedInspectionStatus(item.Status));
        await renderInspectionMarkers();
        renderCurrentLocation();
    } catch (error) {
        console.error(error);
        setStatus('Unable to load inspection locations right now.');
    }
}

async function renderInspectionMarkers() {
    if (!state.map || !state.markersLayer) return;

    const token = state.geocodeRequestToken + 1;
    state.geocodeRequestToken = token;

    state.markersLayer.clearLayers();

    const sourceItems = state.todayOnly
        ? state.plannedItems.filter((item) => hasInspectionToday(item.DateInspectTime))
        : state.plannedItems;

    if (sourceItems.length === 0) {
        setStatus(state.todayOnly ? 'No planned inspections found for today.' : 'No planned inspections found.');
        fitMapBounds();
        return;
    }

    setStatus(`Finding map locations for ${sourceItems.length} inspection(s)...`);

    let successCount = 0;
    for (let i = 0; i < sourceItems.length; i += 1) {
        if (token !== state.geocodeRequestToken) {
            return;
        }

        const item = sourceItems[i];
        const query = getLocationQuery(item);
        if (!query) {
            continue;
        }

        const location = await geocodeAddress(query);
        if (!location) {
            continue;
        }

        successCount += 1;

        const popupLines = [];
        const title = [item.Suburb, item.Address].filter(Boolean).join(' - ');
        if (title) {
            popupLines.push(`<strong>${escapeHtml(title)}</strong>`);
        }

        const inspectText = formatInspectTimes(item.DateInspectTime);
        if (inspectText) {
            popupLines.push(`Inspection: ${escapeHtml(inspectText).replace(/\n/g, '<br>')}`);
        }

        L.marker([location.lat, location.lng])
            .addTo(state.markersLayer)
            .bindPopup(popupLines.join('<br>'));

        if ((i + 1) % 6 === 0) {
            await delay(250);
        }
    }

    fitMapBounds();

    if (successCount === 0) {
        setStatus('No listing addresses could be resolved on OpenStreetMap.');
        return;
    }

    const shownCount = state.markersLayer.getLayers().length;
    const suffix = state.todayOnly ? ' for today' : '';
    setStatus(`Showing ${shownCount} planned inspection location(s)${suffix}.`);
}

function renderCurrentLocation() {
    if (!navigator.geolocation || !state.map) {
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            if (!state.map) return;

            const latlng = [position.coords.latitude, position.coords.longitude];

            if (state.userMarker) {
                state.map.removeLayer(state.userMarker);
            }

            state.userMarker = L.circleMarker(latlng, {
                radius: 8,
                color: '#0f4dbf',
                fillColor: '#3b82f6',
                fillOpacity: 0.9,
                weight: 2
            })
                .addTo(state.map)
                .bindPopup('Your current location');

            fitMapBounds();
        },
        () => {
            // Keep markers visible even without geolocation.
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000
        }
    );
}

function fitMapBounds() {
    if (!state.map) return;

    const points = [];

    state.markersLayer.getLayers().forEach((layer) => {
        if (layer.getLatLng) {
            points.push(layer.getLatLng());
        }
    });

    if (state.userMarker && state.userMarker.getLatLng) {
        points.push(state.userMarker.getLatLng());
    }

    if (points.length === 0) {
        state.map.setView([-33.8688, 151.2093], 10);
        return;
    }

    const bounds = L.latLngBounds(points);
    state.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
}

function normalizeStatus(status) {
    return String(status || '').trim().toLowerCase();
}

function isPlannedInspectionStatus(status) {
    return normalizeStatus(status) === 'planned inspection';
}

function getLocationQuery(item) {
    const address = String(item.Address || item.address || '').trim();
    const suburb = String(item.Suburb || item.suburb || '').trim();
    return [address, suburb].filter(Boolean).join(', ');
}

function hasInspectionToday(dateTimeStr) {
    if (!dateTimeStr || typeof dateTimeStr !== 'string') return false;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();

    const timestamps = dateTimeStr
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length === 13 && part[8] === 'T');

    return timestamps.some((rawValue) => {
        const y = Number(rawValue.substring(0, 4));
        const m = Number(rawValue.substring(4, 6)) - 1;
        const d = Number(rawValue.substring(6, 8));

        return y === year && m === month && d === day;
    });
}

function formatInspectTimes(dateTimeStr) {
    if (!dateTimeStr || typeof dateTimeStr !== 'string') return '';

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

            const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
            const weekday = weekdays[date.getDay()];

            return `(${weekday}) ${day}/${month}/${year.substring(2)} ${hour}:${minute}`;
        });

    return parsed.join('\n');
}

async function geocodeAddress(query) {
    if (!query) return null;

    const cacheHit = state.geocodeCache[query];
    if (cacheHit && Number.isFinite(cacheHit.lat) && Number.isFinite(cacheHit.lng)) {
        return cacheHit;
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(url, {
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            return null;
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

        const value = {
            lat,
            lng,
            label: first.display_name || query
        };

        state.geocodeCache[query] = value;
        saveGeocodeCache(state.geocodeCache);
        return value;
    } catch (error) {
        return null;
    }
}

function loadGeocodeCache() {
    try {
        const raw = localStorage.getItem('rentfind_geocode_cache_v1');
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        return parsed;
    } catch (error) {
        return {};
    }
}

function saveGeocodeCache(cache) {
    try {
        localStorage.setItem('rentfind_geocode_cache_v1', JSON.stringify(cache));
    } catch (error) {
        // Ignore storage failures.
    }
}

function setStatus(message) {
    if (!dom.mapStatus) return;
    dom.mapStatus.textContent = message;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
}

function delay(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
