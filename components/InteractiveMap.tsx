import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L, { LatLngExpression, LeafletMouseEvent, LatLngBoundsExpression } from 'leaflet';
import { DAMASCUS_COORDS } from '../constants';

// --- Custom Icons ---
const startIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="#10B981"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/><text x="12" y="11" font-size="8" font-weight="bold" fill="white" text-anchor="middle" dy=".3em">A</text></svg>`;
const endIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="#EF4444"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/><text x="12" y="11" font-size="8" font-weight="bold" fill="white" text-anchor="middle" dy=".3em">B</text></svg>`;
const driverIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="#f97316"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11C5.84 5 5.28 5.42 5.08 6.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5S18.33 16 17.5 16zM5 11l1.5-4.5h11L19 11H5z"/></svg>`;


const startIcon = new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(startIconSvg)}`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
});

const endIcon = new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(endIconSvg)}`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
});

const driverIcon = new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(driverIconSvg)}`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
});

const userLocationIcon = new L.DivIcon({
    className: 'user-location-icon',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
});
// --- End Custom Icons ---

interface MapUpdaterProps {
  center: LatLngExpression;
  zoom: number;
}

const MapUpdater: React.FC<MapUpdaterProps> = ({ center, zoom }) => {
    const map = useMap();
    useEffect(() => {
        map.invalidateSize();
        map.setView(center, zoom);
    }, [center, zoom, map]);
    return null;
};

interface MapEventsProps {
    onMapClick: (e: LeafletMouseEvent) => void;
}

const MapEvents: React.FC<MapEventsProps> = ({ onMapClick }) => {
    useMapEvents({
        click: onMapClick,
    });
    return null;
}

interface InteractiveMapProps {
  center?: [number, number];
  zoom?: number;
  startLocation?: { lat: number; lng: number; name: string };
  endLocation?: { lat: number; lng: number; name:string };
  userLocation?: { lat: number; lng: number; };
  driverLocation?: { lat: number; lng: number; };
  routePolyline?: [number, number][];
  onMapClick?: (e: LeafletMouseEvent) => void;
}

const InteractiveMap: React.FC<InteractiveMapProps> = ({
  center = DAMASCUS_COORDS,
  zoom = 13,
  startLocation,
  endLocation,
  userLocation,
  driverLocation,
  routePolyline,
  onMapClick
}) => {

  const bounds = routePolyline && routePolyline.length > 0
    ? routePolyline
    : [startLocation, endLocation, userLocation, driverLocation].filter(Boolean).map(loc => [loc!.lat, loc!.lng] as [number, number]);

  const FitBounds: React.FC<{ bounds: LatLngBoundsExpression }> = ({ bounds }) => {
      const map = useMap();
      useEffect(() => {
          if (bounds && Array.isArray(bounds) && bounds.length > 0) {
              map.invalidateSize();
              map.fitBounds(bounds, { padding: [50, 50] });
          }
      }, [bounds, map]);
      return null;
  }
  
  const isUserAtStart = userLocation && startLocation && 
    userLocation.lat.toFixed(5) === startLocation.lat.toFixed(5) && 
    userLocation.lng.toFixed(5) === startLocation.lng.toFixed(5);
  
  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom={true} className="h-full w-full z-0">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {startLocation && (
        <Marker position={[startLocation.lat, startLocation.lng]} icon={startIcon}>
          <Popup>نقطة الانطلاق: {startLocation.name}</Popup>
        </Marker>
      )}
      
      {endLocation && (
        <Marker position={[endLocation.lat, endLocation.lng]} icon={endIcon}>
          <Popup>الوجهة: {endLocation.name}</Popup>
        </Marker>
      )}

      {userLocation && !isUserAtStart && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon} >
           <Popup>موقعك الحالي</Popup>
        </Marker>
      )}
      
      {driverLocation && (
        <Marker position={[driverLocation.lat, driverLocation.lng]} icon={driverIcon}>
          <Popup>موقع السائق</Popup>
        </Marker>
      )}

      {routePolyline && routePolyline.length > 0 && (
        <>
          {/* Casing for the polyline to make it stand out */}
          <Polyline positions={routePolyline} color="#022c7a" weight={9} opacity={0.8} />
          {/* Main polyline */}
          <Polyline positions={routePolyline} color="#3b82f6" weight={6} opacity={0.9} />
        </>
      )}
      
      {bounds.length > 1 && <FitBounds bounds={bounds} />}
      {!bounds || bounds.length <= 1 && <MapUpdater center={center} zoom={zoom} />}
      {onMapClick && <MapEvents onMapClick={onMapClick} />}
    </MapContainer>
  );
};

export default InteractiveMap;