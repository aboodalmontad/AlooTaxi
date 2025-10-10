import React, { useEffect, ReactNode, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L, { LatLngBoundsExpression, LatLngTuple } from 'leaflet';
import { DAMASCUS_COORDS } from '../constants';

// --- Custom Icons ---
const startIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="#10B981"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/><text x="12" y="11" font-size="8" font-weight="bold" fill="white" text-anchor="middle" dy=".3em">A</text></svg>`;
const endIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="#EF4444"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/><text x="12" y="11" font-size="8" font-weight="bold" fill="white" text-anchor="middle" dy=".3em">B</text></svg>`;
const driverIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="#f97316"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11C5.84 5 5.28 5.42 5.08 6.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5S18.33 16 17.5 16zM5 11l1.5-4.5h11L19 11H5z"/></svg>`;
const navigationArrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48"><path fill="#3B82F6" d="M12 2L4.5 20.29l.71.71L12 18l6.79 2.99l.71-.71z"/><path fill="#ffffff" stroke="#3B82F6" stroke-width="0.5" d="M12 4.43L17.57 18l-5.57-2.43l-5.57 2.43z"/></svg>`;
const idleDriverIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" fill="#0d9488"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11C5.84 5 5.28 5.42 5.08 6.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5S18.33 16 17.5 16zM5 11l1.5-4.5h11L19 11H5z"/></svg>`;


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

const navigationArrowIcon = new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(navigationArrowSvg)}`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
});

const idleDriverIcon = new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(idleDriverIconSvg)}`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
});
// --- End Custom Icons ---

interface MapUpdaterProps {
  center: [number, number];
  zoom: number;
}

const MapUpdater: React.FC<MapUpdaterProps> = ({ center, zoom }) => {
    const map = useMap();
    useEffect(() => {
        map.invalidateSize();
        map.setView(center, zoom);
        if ((map as any).setBearing) {
            (map as any).setBearing(0); // Reset bearing in normal mode
        }
    }, [center, zoom, map]);
    return null;
};

const NavigationUpdater: React.FC<{ center: [number, number]; bearing: number; }> = ({ center, bearing }) => {
    const map = useMap();
    useEffect(() => {
        map.invalidateSize();
        map.flyTo(center, 17, { // Zoom level 17 for better route visibility
            animate: true,
            duration: 0.5,
        });
        if ((map as any).setBearing) {
            (map as any).setBearing(bearing);
        }
    }, [center, bearing, map]);
    return null;
};


const MapCenterHandler: React.FC<{ onCenterChange?: (center: { lat: number; lng: number }) => void }> = ({ onCenterChange }) => {
    const map = useMapEvents({
        moveend: () => {
            if (onCenterChange) {
                const center = map.getCenter();
                onCenterChange({ lat: center.lat, lng: center.lng });
            }
        },
        load: () => {
            if (onCenterChange) {
                const center = map.getCenter();
                onCenterChange({ lat: center.lat, lng: center.lng });
            }
        },
    });
    return null;
};

const MapInteractionHandler: React.FC<{ onUserInteraction: () => void }> = ({ onUserInteraction }) => {
    useMapEvents({
        dragstart: () => onUserInteraction(),
        zoomstart: () => onUserInteraction(),
    });
    return null;
};

export interface RouteStyle {
  polyline: [number, number][];
  color: string;
  casingColor?: string;
  weight?: number;
  opacity?: number;
}

// Marker Components for external use
const DriverMarker: React.FC<{ position: LatLngTuple; popupContent: string | ReactNode }> = ({ position, popupContent }) => (
    <Marker position={position} icon={driverIcon}>
        <Popup>{popupContent}</Popup>
    </Marker>
);

interface InteractiveMapProps {
  center?: [number, number];
  zoom?: number;
  startLocation?: { lat: number; lng: number; name: string };
  endLocation?: { lat: number; lng: number; name:string };
  userLocation?: { lat: number; lng: number; };
  driverLocation?: { lat: number; lng: number; };
  routes?: RouteStyle[];
  navigationMode?: { enabled: boolean; bearing: number; };
  onCenterChange?: (center: { lat: number; lng: number }) => void;
  disableAutoPanZoom?: boolean;
  onUserInteraction?: () => void;
  children?: ReactNode; // To allow passing markers as children
  userLocationAs?: 'driver' | 'customer';
}

const InteractiveMap: React.FC<InteractiveMapProps> & { DriverMarker: typeof DriverMarker } = ({
  center = DAMASCUS_COORDS,
  zoom = 13,
  startLocation,
  endLocation,
  userLocation,
  driverLocation,
  routes,
  navigationMode,
  onCenterChange,
  disableAutoPanZoom = false,
  onUserInteraction,
  children,
  userLocationAs = 'customer',
}) => {
  const isNavigating = navigationMode?.enabled === true;

  const determineUserIcon = () => {
    if (isNavigating) {
      return navigationArrowIcon;
    }
    if (userLocationAs === 'driver') {
      return idleDriverIcon;
    }
    return userLocationIcon; // Default for customer (blue dot)
  };

  const driverMarkerChildren = React.Children.toArray(children).filter(child =>
    React.isValidElement(child) && child.type === DriverMarker
  );

  const driverMarkerPositions = driverMarkerChildren.map(child =>
    (React.isValidElement(child) ? child.props.position : null)
  ).filter(Boolean);

  const bounds = routes && routes.length > 0
    ? routes.flatMap(r => r.polyline)
    : [startLocation, endLocation, userLocation, driverLocation].filter(Boolean).map(loc => [loc!.lat, loc!.lng] as [number, number]);

  // Add children marker positions to bounds calculation
  if(driverMarkerPositions.length > 0) {
      bounds.push(...driverMarkerPositions);
  }

  const FitBounds: React.FC<{ bounds: LatLngBoundsExpression }> = ({ bounds }) => {
      const map = useMap();
      useEffect(() => {
          if (bounds && Array.isArray(bounds) && bounds.length > 0) {
              map.invalidateSize();
              map.fitBounds(bounds, { padding: [50, 50] });
              if ((map as any).setBearing) {
                (map as any).setBearing(0);
              }
          }
      }, [bounds, map]);
      return null;
  }
  
  const rotationOptions = {
    rotate: true,
    touchRotate: true,
    rotateControl: {
      position: 'topleft'
    }
  };

  return (
    <MapContainer 
        center={center} 
        zoom={zoom} 
        scrollWheelZoom={true} 
        className={`h-full w-full z-0 ${isNavigating ? 'navigation-view' : ''}`}
        {...rotationOptions as any}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={determineUserIcon()} zIndexOffset={1000} >
           <Popup>موقعك الحالي</Popup>
        </Marker>
      )}

      {/* The 'A' marker for the route start. Only show when a destination is also set. */}
      {startLocation && endLocation && (
        <Marker position={[startLocation.lat, startLocation.lng]} icon={startIcon}>
          <Popup>نقطة الانطلاق: {startLocation.name}</Popup>
        </Marker>
      )}
      
      {/* The 'B' marker for the route end. */}
      {endLocation && (
        <Marker position={[endLocation.lat, endLocation.lng]} icon={endIcon}>
          <Popup>الوجهة: {endLocation.name}</Popup>
        </Marker>
      )}
      
      {/* The orange taxi icon for the driver's live location. */}
      {driverLocation && (
        <Marker position={[driverLocation.lat, driverLocation.lng]} icon={driverIcon}>
          <Popup>موقع السائق</Popup>
        </Marker>
      )}

      {/* For other markers passed as children, like in the admin live map */}
      {children}

      {/* For drawing routes on the map */}
      {routes && routes.map((route, index) => (
        <React.Fragment key={index}>
          <Polyline 
            positions={route.polyline} 
            color={route.casingColor || '#022c7a'} 
            weight={route.weight ? route.weight + 3 : 9} 
            opacity={route.opacity ? route.opacity * 0.8 : 0.8} 
          />
          <Polyline 
            positions={route.polyline} 
            color={route.color} 
            weight={route.weight || 6} 
            opacity={route.opacity || 0.9} 
          />
        </React.Fragment>
      ))}
      
      {/* Map view controllers */}
      {isNavigating && userLocation ? (
          <NavigationUpdater center={[userLocation.lat, userLocation.lng]} bearing={navigationMode.bearing} />
      ) : (
        <>
            {!disableAutoPanZoom && bounds.length > 1 && <FitBounds bounds={bounds} />}
            {!disableAutoPanZoom && (!bounds || bounds.length <= 1) && <MapUpdater center={center} zoom={zoom} />}
        </>
      )}
      {onCenterChange && <MapCenterHandler onCenterChange={onCenterChange} />}
      {onUserInteraction && <MapInteractionHandler onUserInteraction={onUserInteraction} />}
    </MapContainer>
  );
};

InteractiveMap.DriverMarker = DriverMarker;

export default InteractiveMap;