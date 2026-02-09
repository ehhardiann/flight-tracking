// Inisialisasi Map
const map = L.map('map').setView([-2.5, 118], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

let flightMarkers = {};
let flightData = {};
let flightLines = {}; 
let airportMarkers = {}; 
let isFirstLoad = true;
let animationFrame = null;
let currentOpenPopup = null; 

const airportCoordinates = {
    'CGK': [-6.1256, 106.6559],   // Jakarta
    'SUB': [-7.3797, 112.7869],   // Surabaya
    'DPS': [-8.7467, 115.1670],   // Bali (Denpasar)
    'KNO': [3.6422, 98.8853],     // Medan
    'UPG': [-5.0616, 119.5539],   // Makassar (Ujung Pandang)
    'BTH': [1.1211, 104.1187],    // Batam
    'PLM': [-2.8976, 104.7001],   // Palembang
    'JOG': [-7.7956, 110.3695],   // Yogyakarta
    'HLP': [-6.2461, 106.8530],   // Jakarta Halim
    'BPN': [-6.9271, 107.6411],   // Bandung
    'PKU': [-7.0206, 110.4045],   // Pontianak
    'BDO': [-7.2205, 112.7519],   // Bandjarmasin
    'MDC': [-3.0489, 119.7084],   // Manado
    'DJJ': [-2.5897, 140.6700],   // Jayapura
    'CXP': [-8.0711, 115.6852],   // Kupang
    'SQH': [-2.9131, 104.5654],   // Singkawang
    'TJQ': [-0.1551, 109.4174],   // Tanjung Redep
    'PNK': [1.5853, 100.0087],    // Pekanbaru
    'KUQ': [-5.1081, 119.0204],   // Kendari
    'BUQ': [-6.0319, 103.5955],   // Bengkulu
    'UIR': [-0.2584, 109.6192]    // Uji Raya
};

const airportNames = {
    'CGK': 'JAKARTA',
    'SUB': 'SURABAYA', 
    'DPS': 'BALI',
    'KNO': 'MEDAN',
    'UPG': 'MAKASSAR',
    'BTH': 'BATAM',
    'PLM': 'PALEMBANG',
    'JOG': 'YOGYAKARTA',
    'HLP': 'JAKARTA HALIM',
    'BPN': 'BANDUNG',
    'PKU': 'PONTIANAK',
    'BDO': 'BANDJARMASIN',
    'MDC': 'MANADO',
    'DJJ': 'JAYAPURA',
    'CXP': 'KUPANG',
    'SQH': 'SINGKAWANG',
    'TJQ': 'TANJUNG REDEP',
    'PNK': 'PEKANBARU',
    'KUQ': 'KENDARI',
    'BUQ': 'BENGKULU',
    'UIR': 'UJI RAYA'
};

const createPlaneIcon = (rotation, zoomLevel) => {
    const baseSize = 20;
    const size = baseSize + (zoomLevel - 5) * 3;
    const clampedSize = Math.max(20, Math.min(size, 60));
    
    return L.divIcon({
        html: `<div class="plane-marker" style="transform: rotate(${rotation}deg); font-size: ${clampedSize}px; cursor: pointer; transition: font-size 0.3s ease; pointer-events: auto; z-index: 1000;">✈️</div>`,
        className: 'plane-icon',
        iconSize: [clampedSize, clampedSize],
        iconAnchor: [clampedSize/2, clampedSize/2]
    });
};

// Fungsi untuk menghitung jarak antara dua koordinat (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius bumi dalam km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Fungsi untuk format waktu elapsed
function getTimeElapsed(departureTime) {
    if (!departureTime) return 'N/A';
    const now = new Date();
    const dep = new Date(departureTime);
    const diff = Math.floor((now - dep) / 60000); // dalam menit
    
    if (diff < 60) return `${diff} min ago`;
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')} ago`;
}

// Fungsi untuk format waktu remaining
function getTimeRemaining(arrivalTime) {
    if (!arrivalTime) return 'N/A';
    const now = new Date();
    const arr = new Date(arrivalTime);
    const diff = Math.floor((arr - now) / 60000);
    
    if (diff < 0) return 'Landed';
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return `in ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function calculateNextPosition(lat, lng, speed, direction, deltaTime) {
    const speedMps = (speed || 800) / 3.6;
    const distanceMeters = speedMps * deltaTime;
    const distanceDegrees = distanceMeters / 111000;
    
    const directionRad = (direction || 0) * Math.PI / 180;
    const deltaLat = distanceDegrees * Math.cos(directionRad);
    const deltaLng = distanceDegrees * Math.sin(directionRad) / Math.cos(lat * Math.PI / 180);
    
    return {
        lat: lat + deltaLat,
        lng: lng + deltaLng
    };
}

let lastUpdateTime = Date.now();

function animateAllPlanes() {
    const currentTime = Date.now();
    const deltaTime = (currentTime - lastUpdateTime) / 1000;
    lastUpdateTime = currentTime;
    
    Object.keys(flightData).forEach(flightId => {
        const flight = flightData[flightId];
        const marker = flightMarkers[flightId];
        
        if (marker && flight) {
            const newPos = calculateNextPosition(
                flight.lat, 
                flight.lng, 
                flight.speed, 
                flight.direction, 
                deltaTime
            );
            
            flight.lat = newPos.lat;
            flight.lng = newPos.lng;
            
            marker.setLatLng([newPos.lat, newPos.lng]);
            
      
            if (flightLines[flightId] && flight.departureCoords) {
                flightLines[flightId].setLatLngs([
                    flight.departureCoords,
                    [newPos.lat, newPos.lng]
                ]);
            }
        }
    });
    
    animationFrame = requestAnimationFrame(animateAllPlanes);
}

function updateFlightData(flights) {
    const currentFlightIds = new Set();
    const currentZoom = map.getZoom();
    
    flights.forEach(flight => {
        const flightId = flight.flight.iataNumber || flight.aircraft.regNumber || Math.random().toString();
        const geo = flight.geography;
        
        if (!geo || !geo.latitude || !geo.longitude) return;
        
        // 🔴 FILTER: Hanya tampilkan flight domestik Indonesia
        const depCode = flight.departure.iataCode;
        const arrCode = flight.arrival.iataCode;
        
        // Skip jika departure ATAU arrival bukan bandara Indonesia
        if (!airportCoordinates[depCode] || !airportCoordinates[arrCode]) {
            return;
        }
        
        currentFlightIds.add(flightId);
        
        const depCoords = airportCoordinates[depCode];
      
        let distanceFromDep = 'N/A';
        let distanceToArr = 'N/A';
        
        if (depCoords) {
            distanceFromDep = Math.round(calculateDistance(
                depCoords[0], depCoords[1],
                geo.latitude, geo.longitude
            ));
        }
        
    
        const arrCoords = airportCoordinates[arrCode];
        if (arrCoords) {
            distanceToArr = Math.round(calculateDistance(
                geo.latitude, geo.longitude,
                arrCoords[0], arrCoords[1]
            ));
        }

        const timeElapsed = getTimeElapsed(flight.departure.scheduledTime);
        const timeRemaining = getTimeRemaining(flight.arrival.scheduledTime);

        const popupContent = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; min-width: 300px; padding: 10px;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; margin: -10px -10px 10px -10px; border-radius: 8px 8px 0 0;">
                    <h2 style="margin: 0; font-size: 24px; font-weight: bold;">✈️ ${flight.flight.iataNumber || flight.flight.icaoNumber || 'N/A'}</h2>
                    <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">${flight.airline?.name || 'Airline ' + (flight.airline?.iataCode || 'N/A')}</p>
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin: 15px 0; padding: 0 5px;">
                    <div style="text-align: center; flex: 1;">
                        <div style="font-size: 28px; font-weight: bold; color: #333;">${flight.departure.iataCode || '?'}</div>
                        <div style="font-size: 11px; color: #666; margin-top: 5px; text-transform: uppercase;">${airportNames[flight.departure.iataCode] || flight.departure.iataCode || 'N/A'}</div>
                        <div style="font-size: 10px; color: #999;">WIB (UTC +07:00)</div>
                    </div>
                    <div style="flex: 1; text-align: center;">
                        <div style="font-size: 24px; color: #667eea;">→</div>
                        <div style="font-size: 10px; color: #999; margin-top: 3px;">${flight.status || 'en-route'}</div>
                    </div>
                    <div style="text-align: center; flex: 1;">
                        <div style="font-size: 28px; font-weight: bold; color: #333;">${flight.arrival.iataCode || '?'}</div>
                        <div style="font-size: 11px; color: #666; margin-top: 5px; text-transform: uppercase;">${airportNames[flight.arrival.iataCode] || flight.arrival.iataCode || 'N/A'}</div>
                        <div style="font-size: 10px; color: #999;">+08 (UTC +08:00)</div>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; background: #fff3cd; padding: 10px; border-radius: 6px; margin: 10px 0; font-size: 12px;">
                    <div style="text-align: center;">
                        <div style="font-weight: bold; color: #856404;">SCHEDULED</div>
                        <div style="font-size: 16px; font-weight: bold; margin-top: 3px;">${flight.departure.scheduledTime ? new Date(flight.departure.scheduledTime).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true}) : 'N/A'}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-weight: bold; color: #856404;">SCHEDULED</div>
                        <div style="font-size: 16px; font-weight: bold; margin-top: 3px;">${flight.arrival.scheduledTime ? new Date(flight.arrival.scheduledTime).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true}) : 'N/A'}</div>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; background: #d4edda; padding: 10px; border-radius: 6px; margin: 10px 0; font-size: 12px;">
                    <div style="text-align: center;">
                        <div style="font-weight: bold; color: #155724;">ACTUAL</div>
                        <div style="font-size: 16px; font-weight: bold; margin-top: 3px; color: #155724;">${flight.departure.actualTime ? new Date(flight.departure.actualTime).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true}) : 'N/A'}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-weight: bold; color: #155724;">ESTIMATED</div>
                        <div style="font-size: 16px; font-weight: bold; margin-top: 3px; color: #155724;">● ${flight.arrival.estimatedTime ? new Date(flight.arrival.estimatedTime).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true}) : 'N/A'}</div>
                    </div>
                </div>

                <div style="border-bottom: 2px solid #ffc107; margin: 15px 0;"></div>

                <div style="display: flex; justify-content: space-between; font-size: 13px; margin: 10px 0;">
                    <div><strong>${distanceFromDep !== 'N/A' ? distanceFromDep + ' km' : 'N/A'}</strong>, ${timeElapsed}</div>
                    <div><strong>${distanceToArr !== 'N/A' ? distanceToArr + ' km' : 'N/A'}</strong>, ${timeRemaining}</div>
                </div>

                <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin: 10px 0;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
                        <div>
                            <div style="color: #666; font-size: 11px; text-transform: uppercase; margin-bottom: 3px;">Speed</div>
                            <div style="font-weight: bold; color: #333; font-size: 16px;">🚀 ${Math.round(flight.speed?.horizontal || 0)} km/h</div>
                        </div>
                        <div>
                            <div style="color: #666; font-size: 11px; text-transform: uppercase; margin-bottom: 3px;">Altitude</div>
                            <div style="font-weight: bold; color: #333; font-size: 16px;">⬆️ ${Math.round(geo.altitude || 0)} m</div>
                        </div>
                    </div>
                </div>

                <div style="border-top: 1px solid #e0e0e0; padding-top: 10px; margin-top: 10px;">
                    <div style="font-size: 12px; color: #666; line-height: 1.6;">
                        <div style="margin: 5px 0;"><strong>Aircraft:</strong> ${flight.aircraft?.model || flight.aircraft?.iataCode || 'N/A'}</div>
                        <div style="margin: 5px 0;"><strong>Registration:</strong> ${flight.aircraft?.regNumber || 'N/A'}</div>
                        <div style="margin: 5px 0;"><strong>Callsign:</strong> ${flight.flight?.icaoNumber || 'N/A'}</div>
                    </div>
                </div>
            </div>`;

        if (!flightData[flightId]) {
            flightData[flightId] = {
                lat: geo.latitude,
                lng: geo.longitude,
                speed: flight.speed.horizontal || 800,
                direction: geo.direction || 0,
                popup: popupContent,
                departureCoords: depCoords,
                flightNumber: flight.flight.iataNumber
            };
            
            const marker = L.marker([geo.latitude, geo.longitude], {
                icon: createPlaneIcon(geo.direction || 0, currentZoom),
                interactive: true,
                bubblingMouseEvents: false
            }).addTo(map);
            
            marker.bindPopup(popupContent, {
                closeButton: true,
                autoClose: true,  
                closeOnClick: false,
                maxWidth: 400,
                minWidth: 350,
                className: 'flight-popup'
            });
            
            marker.on('click', function(e) {
                L.DomEvent.stopPropagation(e);
                
               
                if (currentOpenPopup && currentOpenPopup !== this) {
                    currentOpenPopup.closePopup();
                }
                
                this.openPopup();
                currentOpenPopup = this;  
            });
            
            marker.on('mouseover', function() {
                this.getElement().style.transform += ' scale(1.2)';
                this.getElement().style.filter = 'brightness(1.3)';
            });
            
            marker.on('mouseout', function() {
                this.getElement().style.filter = 'brightness(1)';
            });
            
            flightMarkers[flightId] = marker;
            
          
            if (depCoords) {
                const line = L.polyline([depCoords, [geo.latitude, geo.longitude]], {
                    color: '#667eea',
                    weight: 2,
                    opacity: 0.6,
                    dashArray: '5, 10'
                }).addTo(map);
                flightLines[flightId] = line;
            }
        } else {
            flightData[flightId].speed = flight.speed.horizontal || 800;
            flightData[flightId].direction = geo.direction || 0;
            flightData[flightId].popup = popupContent;
            
            if (flightMarkers[flightId]) {
                flightMarkers[flightId].getPopup().setContent(popupContent);
            }
            
            const distance = Math.sqrt(
                Math.pow(geo.latitude - flightData[flightId].lat, 2) + 
                Math.pow(geo.longitude - flightData[flightId].lng, 2)
            );
            
            if (distance > 0.1) {
                flightData[flightId].lat += (geo.latitude - flightData[flightId].lat) * 0.3;
                flightData[flightId].lng += (geo.longitude - flightData[flightId].lng) * 0.3;
            }
        }
    });

    Object.keys(flightMarkers).forEach(id => {
        if (!currentFlightIds.has(id)) {
            map.removeLayer(flightMarkers[id]);
            if (flightLines[id]) map.removeLayer(flightLines[id]);
            delete flightMarkers[id];
            delete flightLines[id];
            delete flightData[id];
        }
    });

    if (isFirstLoad && Object.keys(flightMarkers).length > 0) {
        const group = L.featureGroup(Object.values(flightMarkers));
        map.fitBounds(group.getBounds().pad(0.2));
        isFirstLoad = false;
    }
}


window.searchFlight = function(flightNumber) {
    const searchTerm = flightNumber.toUpperCase().trim();
    
    for (let flightId in flightData) {
        if (flightData[flightId].flightNumber && 
            flightData[flightId].flightNumber.toUpperCase().includes(searchTerm)) {
            const marker = flightMarkers[flightId];
            if (marker) {
                map.setView(marker.getLatLng(), 10, { animate: true });
                marker.openPopup();
                return true;
            }
        }
    }
    alert(`Flight ${searchTerm} not found!`);
    return false;
};

map.on('zoomend', function() {
    const currentZoom = map.getZoom();
    Object.keys(flightMarkers).forEach(flightId => {
        const flight = flightData[flightId];
        const marker = flightMarkers[flightId];
        if (marker && flight) {
            const newIcon = createPlaneIcon(flight.direction, currentZoom);
            marker.setIcon(newIcon);
            
            setTimeout(() => {
                const element = marker.getElement();
                if (element) {
                    element.style.pointerEvents = 'auto';
                    element.style.cursor = 'pointer';
                }
            }, 100);
        }
    });
});

async function fetchFlightData() {
    try {
        const response = await fetch('/api/flights');
        const data = await response.json();
        if (Array.isArray(data)) {
            updateFlightData(data);
        }
    } catch (error) {
        console.error('Fetch error:', error);
    }
}

animateAllPlanes();
fetchFlightData();
setInterval(fetchFlightData, 3000);