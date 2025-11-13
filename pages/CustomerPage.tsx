import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRide } from '../contexts/RideContext';
import InteractiveMap from '../components/InteractiveMap';
import { DAMASCUS_COORDS, VEHICLE_TYPES, PROVINCE_COORDS, SYRIAN_PROVINCES } from '../constants';
import { RideStatus, RouteInfo, VehicleType, LocationSuggestion, Ride, SyrianProvinces, Driver } from '../types';
import { getRoute, searchLocations, getHaversineDistance, isValidLocation } from '../services/mapService';
import LiveTripDisplay from '../components/LiveTripDisplay';
import NavigationUI from '../components/NavigationUI';

// Custom hook for debouncing input
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
};

type MapViewMode = 'free' | 'locked' | 'navigation';

const CustomerPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { currentRide, requestRide, cancelRide, getEstimatedFare, onlineDrivers, liveTripData } = useRide();
  
  // Location and Route State
  const [startLocation, setStartLocation] = useState<{ lat: number; lng: number; name: string; heading: number | null } | null>(null);
  const [endLocation, setEndLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [navigationRoute, setNavigationRoute] = useState<RouteInfo | null>(null);

  
  // UI and Flow State
  const [currentStep, setCurrentStep] = useState('setDestination'); // setDestination, selectVehicle, confirmRequest
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationWarning, setLocationWarning] = useState<string | null>(null);
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>('locked');
  
  // --- START: New state for Pin Drop feature ---
  const [pinDropMode, setPinDropMode] = useState<'start' | 'end' | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  // --- END: New state for Pin Drop feature ---

  // Search and Autocomplete State
  const [startQuery, setStartQuery] = useState('');
  const [endQuery, setEndQuery] = useState('');
  const [startSuggestions, setStartSuggestions] = useState<LocationSuggestion[]>([]);
  const [endSuggestions, setEndSuggestions] = useState<LocationSuggestion[]>([]);
  const [activeInput, setActiveInput] = useState<'start' | 'end' | null>(null);

  const debouncedStartQuery = useDebounce(startQuery, 400);
  const debouncedEndQuery = useDebounce(endQuery, 400);

  // Vehicle and Scheduling State
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');

  const prevRideRef = useRef<Ride | null>();
  const locationWatchIdRef = useRef<number | null>(null);
  const latestPositionRef = useRef<GeolocationPosition | null>(null);

  const userProvince = user?.province || SyrianProvinces.DAMASCUS;
  const provinceCenter = useMemo(() => ({
      lat: PROVINCE_COORDS[userProvince][0],
      lng: PROVINCE_COORDS[userProvince][1]
  }), [userProvince]);

  const assignedDriver = useMemo<Driver | null>(() => {
    if (currentRide && currentRide.driverId) {
        return onlineDrivers.find(d => d.id === currentRide.driverId) || null;
    }
    return null;
  }, [currentRide, onlineDrivers]);

  const fetchUserLocation = useCallback((isManualRequest = false) => {
    setStartLocation(null);
    setIsLocating(true);
    setStartQuery("...جاري تحديد الموقع");
    setRouteInfo(null);
    setRouteError(null);
    setLocationError(null);
    setLocationWarning(null);
    latestPositionRef.current = null; // Reset for the new fetch attempt

    const province = user?.province || SyrianProvinces.DAMASCUS;
    const provinceCoords = PROVINCE_COORDS[province] || DAMASCUS_COORDS;
    const provinceName = SYRIAN_PROVINCES.find(p => p.id === province)?.ar || 'دمشق';
    const fallbackLocation = { lat: provinceCoords[0], lng: provinceCoords[1], name: `وسط ${provinceName}`, heading: null };
    
    const clearWatch = () => {
        if (locationWatchIdRef.current !== null) {
            navigator.geolocation.clearWatch(locationWatchIdRef.current);
            locationWatchIdRef.current = null;
        }
    };
    clearWatch();

    if (!navigator.geolocation) {
        setStartLocation(fallbackLocation);
        setStartQuery(fallbackLocation.name);
        setLocationError("خدمات الموقع الجغرافي غير مدعومة في متصفحك.");
        setIsLocating(false);
        return;
    }

    const locationTimeout = setTimeout(() => {
        clearWatch();
        const lastPosition = latestPositionRef.current;
        if (lastPosition) {
            // We have a position, but it must have been inaccurate. Use it but with a persistent warning.
            const { latitude, longitude, heading, accuracy } = lastPosition.coords;
            const newLocation = { lat: latitude, lng: longitude, name: "موقع تقريبي", heading };
            setLocationWarning(`تم استخدام موقع تقريبي بدقة (${Math.round(accuracy)} متر). حاول الانتقال إلى مكان مفتوح للحصول على دقة أفضل.`);
            setLocationError(null);
            setStartLocation(newLocation);
            setStartQuery(newLocation.name);
            setIsLocating(false);
        } else {
            // We received no position at all. Timeout with an error.
            setLocationError("انتهت مهلة تحديد الموقع. قد تكون إشارة GPS ضعيفة أو أن خدمات الموقع معطلة في جهازك. سيتم استخدام موقع افتراضي.");
            setStartLocation(fallbackLocation);
            setStartQuery(fallbackLocation.name);
            setIsLocating(false);
        }
    }, 25000); // 25 seconds total

    const successCallback = (position: GeolocationPosition) => {
        latestPositionRef.current = position; // Always store the latest position
        const { latitude, longitude, heading, accuracy } = position.coords;

        if (accuracy > 100) {
            setLocationWarning(`دقة الموقع منخفضة (${Math.round(accuracy)} متر). ننتظر إشارة أفضل...`);
            return; // Continue waiting for a better signal
        }

        // Accuracy is good!
        clearTimeout(locationTimeout);
        clearWatch();
        
        const newLocation = { lat: latitude, lng: longitude, name: "موقعي الحالي", heading };
        
        setLocationWarning(null); // Clear any previous warning
        setStartLocation(newLocation);
        setStartQuery(newLocation.name);
        setLocationError(null);
        setIsLocating(false);
        setMapViewMode('locked');
    };

    const errorCallback = (error: GeolocationPositionError) => {
        if (error.code === error.PERMISSION_DENIED) {
            clearTimeout(locationTimeout);
            clearWatch();
            setLocationError("تم رفض إذن الوصول إلى الموقع. يرجى تفعيله من إعدادات المتصفح. سيتم استخدام موقع افتراضي.");
            setStartLocation(fallbackLocation);
            setStartQuery(fallbackLocation.name);
            setIsLocating(false);
        }
    };

    locationWatchIdRef.current = navigator.geolocation.watchPosition(
        successCallback,
        errorCallback,
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
}, [user]);


  const resetJourney = useCallback(() => {
      setStartLocation(null);
      setStartQuery('');
      setEndLocation(null);
      setEndQuery('');
      setRouteInfo(null);
      setRouteError(null);
      setLocationError(null);
      setLocationWarning(null);
      setCurrentStep('setDestination');
      setSelectedVehicle(null);
      setIsScheduling(false);
      setScheduledTime('');
      setMapViewMode('locked');
      setNavigationRoute(null);
  }, []);

  // Cleanup effect for the location watch
  useEffect(() => {
    return () => {
      if (locationWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchIdRef.current);
      }
    };
  }, []);

  // Effect to get initial user location on component mount or after a reset
  useEffect(() => {
    if (!startLocation && !isLocating) {
      fetchUserLocation(false);
    }
  }, [fetchUserLocation, startLocation, isLocating]);

  // --- START: Professional fix for stale location after turning off VPN ---
  // This effect listens for when the user brings the app tab back into focus.
  // When they do, it automatically re-fetches their location to ensure it's up-to-date.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Only re-fetch if there's no active ride, to avoid disrupting a trip.
        if (!currentRide) {
          fetchUserLocation(false);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup the event listener when the component unmounts to prevent memory leaks.
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchUserLocation, currentRide]); // Re-run if these dependencies change.
  // --- END: Professional fix ---


  // Effect to reset UI after a ride is completed
  useEffect(() => {
    // When the ride is completed and then cleared from the context, reset the UI for a new ride.
    if ((prevRideRef.current?.status === RideStatus.COMPLETED || prevRideRef.current?.status === RideStatus.CANCELLED) && !currentRide) {
      resetJourney();
    }
    // Store the current ride state for the next render to detect the change.
    prevRideRef.current = currentRide;
  }, [currentRide, resetJourney]);

  // Effect to re-lock map view when a new ride is requested
  useEffect(() => {
    if (currentRide && prevRideRef.current?.status !== currentRide.status) {
        setMapViewMode('locked');
    }
  }, [currentRide]);


  // Effect for fetching start location suggestions
  useEffect(() => {
    if (debouncedStartQuery && debouncedStartQuery !== 'موقعي الحالي' && !debouncedStartQuery.startsWith('وسط ') && !debouncedStartQuery.startsWith('موقع محدد') && activeInput === 'start') {
      const fetchSuggestions = async () => {
        const results = await searchLocations(debouncedStartQuery, startLocation ?? undefined);
        setStartSuggestions(results);
      };
      fetchSuggestions();
    } else {
      setStartSuggestions([]);
    }
  }, [debouncedStartQuery, startLocation, activeInput]);

  // Effect for fetching end location suggestions
  useEffect(() => {
    if (debouncedEndQuery && !debouncedEndQuery.startsWith('موقع محدد') && activeInput === 'end') {
      const fetchSuggestions = async () => {
        const results = await searchLocations(debouncedEndQuery, startLocation ?? undefined);
        setEndSuggestions(results);
      };
      fetchSuggestions();
    } else {
      setEndSuggestions([]);
    }
  }, [debouncedEndQuery, startLocation, activeInput]);

  // Effect to calculate route when both locations are set
  useEffect(() => {
    const calculateRoute = async () => {
        if (isValidLocation(startLocation) && isValidLocation(endLocation)) {
            setIsLoadingRoute(true);
            setRouteInfo(null); // Clear previous route
            setRouteError(null); // Clear previous error
            try {
                const route = await getRoute(startLocation, endLocation);
                setRouteInfo(route);
                setCurrentStep('selectVehicle');
                setMapViewMode('locked');
            } catch (error) {
                if (error instanceof Error) {
                    setRouteError(error.message);
                } else {
                    setRouteError("حدث خطأ غير معروف أثناء حساب المسار.");
                }
            } finally {
                setIsLoadingRoute(false);
            }
        }
    };
    calculateRoute();
  }, [startLocation, endLocation]);
  
  // Effect for navigation mode route calculation
  useEffect(() => {
    if (!currentRide || !startLocation) {
        setNavigationRoute(null);
        return;
    }
    
    const driverLocation = assignedDriver?.location;
    if (currentRide.status === RideStatus.PICKING_UP && !driverLocation) {
      setNavigationRoute(null);
      return;
    }

    const calculateNavRoute = async () => {
        try {
            let origin: { lat: number; lng: number; } | null | undefined = startLocation;
            let destination: { lat: number; lng: number; } | null | undefined = currentRide.endLocation;

            if (currentRide.status === RideStatus.PICKING_UP && driverLocation) {
                // For customer, nav route is from driver to them, until pickup
                origin = driverLocation;
                destination = currentRide.startLocation;
            } else if (currentRide.status === RideStatus.IN_PROGRESS) {
                // Then from their current location to destination
                origin = startLocation;
                destination = currentRide.endLocation;
            } else {
                setNavigationRoute(null);
                return;
            }

            if (isValidLocation(origin) && isValidLocation(destination)) {
                const route = await getRoute(origin, destination);
                setNavigationRoute(route);
            } else {
                console.warn("Customer nav route calculation skipped due to invalid location(s).", { origin, destination });
                setNavigationRoute(null);
            }

        } catch (error) {
            console.error("Customer nav route calculation failed:", error);
            setNavigationRoute(null);
        }
    };
    
    const debounceTimeout = setTimeout(calculateNavRoute, 2000);
    return () => clearTimeout(debounceTimeout);

  }, [currentRide, startLocation, assignedDriver]);

  const handleSuggestionSelect = (suggestion: LocationSuggestion, type: 'start' | 'end') => {
    const newLocation = {
        lat: suggestion.coordinates.lat,
        lng: suggestion.coordinates.lng,
        name: suggestion.name,
    };

    // Validation: Check if the selected location is too far.
    const originPoint = type === 'start' ? (endLocation || provinceCenter) : (startLocation || provinceCenter);
    
    if (originPoint && typeof originPoint.lat === 'number' && typeof originPoint.lng === 'number') {
        const distance = getHaversineDistance(originPoint, newLocation);
        const MAX_ALLOWED_DISTANCE_KM = 1000; // Consistent with mapService

        if (distance > MAX_ALLOWED_DISTANCE_KM) {
            setRouteError(`الموقع المحدد بعيد جدًا (${Math.round(distance)} كم). يرجى اختيار موقع أقرب داخل البلد.`);
            setActiveInput(null); // Close suggestions
            return;
        }
    }


    if (type === 'start') {
        setStartLocation({...newLocation, heading: null});
        setStartQuery(suggestion.name);
        setStartSuggestions([]);
        setLocationError(null);
        setLocationWarning(null);
    } else {
        setEndLocation(newLocation);
        setEndQuery(suggestion.name);
        setEndSuggestions([]);
    }
    setActiveInput(null);
  };

  const handleRequestRide = () => {
      if (startLocation && endLocation && selectedVehicle && routeInfo) {
          const scheduleDetails = isScheduling && scheduledTime ? { isScheduled: true, time: scheduledTime } : undefined;
          requestRide(startLocation, endLocation, selectedVehicle, routeInfo, scheduleDetails);
      }
  };

  const handleVehicleSelect = (vehicleType: VehicleType) => {
    setSelectedVehicle(vehicleType);
    setCurrentStep('confirmRequest');
  };

  const handleUserInteraction = () => {
    if (pinDropMode) return;
    setMapViewMode('free');
  };

  // --- START: New Handler for Pin Drop feature ---
  const handleConfirmPinDrop = () => {
      if (!mapCenter || !pinDropMode) return;

      const newLocation = {
          ...mapCenter,
          name: `موقع محدد (${mapCenter.lat.toFixed(4)}, ${mapCenter.lng.toFixed(4)})`,
      };

      // Validation: Check if the selected location is too far.
      const originPoint = pinDropMode === 'start' ? (endLocation || provinceCenter) : (startLocation || provinceCenter);
      
      if (originPoint && typeof originPoint.lat === 'number' && typeof originPoint.lng === 'number') {
        const distance = getHaversineDistance(originPoint, newLocation);
        const MAX_ALLOWED_DISTANCE_KM = 1000; // Consistent with mapService

        if (distance > MAX_ALLOWED_DISTANCE_KM) {
            setRouteError(`الموقع المحدد بعيد جدًا (${Math.round(distance)} كم). يرجى اختيار موقع أقرب داخل البلد.`);
            setPinDropMode(null); // Exit pin drop mode
            return;
        }
      }

      if (pinDropMode === 'start') {
          setStartLocation({...newLocation, heading: null});
          setStartQuery(newLocation.name);
          setLocationError(null);
          setLocationWarning(null);
      } else {
          setEndLocation(newLocation);
          setEndQuery(newLocation.name);
      }
      setPinDropMode(null);
  };
  // --- END: New Handler ---

  const RideStatusIndicator = () => {
    if (!currentRide || currentRide.status === RideStatus.IN_PROGRESS) return null; // IN_PROGRESS is handled by LiveTripDisplay
    let message = "";
    switch(currentRide.status) {
        case RideStatus.REQUESTED: message = currentRide.isScheduled ? `تم جدولة رحلتك بنجاح! سيتم البحث عن سائق في ${currentRide.scheduledTime}` : "جاري البحث عن سائق..."; break;
        case RideStatus.ACCEPTED: message = `تم العثور على سائق! السائق في طريقه إليك.`; break;
        case RideStatus.PICKING_UP: message = "السائق يقترب من موقعك."; break;
        case RideStatus.COMPLETED: message = `اكتملت الرحلة! الأجرة النهائية: ${currentRide.finalFare?.toLocaleString('ar-SY', { style: 'currency', currency: 'SYP' })}`; break;
        case RideStatus.CANCELLED: message = "تم إلغاء الرحلة."; break;
        default: return null;
    }
    return (
        <div className="absolute top-20 right-4 left-4 bg-primary/90 backdrop-blur-sm text-white p-4 rounded-lg shadow-lg text-center z-10 animate-fade-in-down">
            <p className="font-bold">{message}</p>
            {assignedDriver && (currentRide.status === RideStatus.ACCEPTED || currentRide.status === RideStatus.PICKING_UP) &&
                <div className="text-sm mt-2">
                    <p>بيانات السائق: {assignedDriver.name} - {assignedDriver.vehicle.model} ({assignedDriver.vehicle.plateNumber})</p>
                    <p>رقم الهاتف: {assignedDriver.phone}</p>
                </div>
            }
        </div>
    );
  }

  const mapCenterCoords = startLocation ? [startLocation.lat, startLocation.lng] : [provinceCenter.lat, provinceCenter.lng] as [number, number];

  const canNavigate = mapViewMode === 'navigation' && !pinDropMode && typeof startLocation?.heading === 'number';

  const mapRoutes = useMemo(() => {
    if (canNavigate && navigationRoute) {
        return [{
            polyline: navigationRoute.polyline,
            color: '#34D399',
            casingColor: '#047857',
            weight: 10,
        }];
    }
    const mainPolyline = currentRide?.polyline || routeInfo?.polyline;
    return mainPolyline ? [{ polyline: mainPolyline, color: '#3b82f6' }] : undefined;
  }, [canNavigate, navigationRoute, currentRide, routeInfo]);


  return (
    <div className="h-screen w-screen flex flex-col relative overflow-hidden">
      <header className="absolute top-0 left-0 right-0 bg-gradient-to-b from-slate-900/80 to-transparent p-4 flex justify-between items-center z-30">
        <h1 className="text-2xl font-bold text-primary">ألو تكسي</h1>
        <div>
          <span className="ml-4">أهلاً، {user?.name}</span>
          <button onClick={logout} className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700">خروج</button>
        </div>
      </header>

      {locationError && (
        <div className="absolute top-20 right-4 left-4 bg-red-800/95 backdrop-blur-sm p-4 rounded-lg shadow-lg z-20 text-center animate-fade-in-down">
            <p className="font-bold">خطأ في تحديد الموقع</p>
            <p>{locationError}</p>
        </div>
      )}
      
      {locationWarning && !locationError && (
        <div className="absolute top-20 right-4 left-4 bg-yellow-600/95 backdrop-blur-sm p-4 rounded-lg shadow-lg z-20 text-center animate-fade-in-down">
            <p className="font-bold">تنبيه بشأن الموقع</p>
            <p>{locationWarning}</p>
        </div>
      )}

      {canNavigate ? (
          <NavigationUI
            routeInfo={navigationRoute}
            currentLocation={startLocation}
          />
      ) : currentRide?.status === RideStatus.IN_PROGRESS && liveTripData ? (
          <div className="absolute inset-x-0 top-0 z-10 pt-20">
              <LiveTripDisplay {...liveTripData} />
          </div>
      ) : (
          <RideStatusIndicator />
      )}

      <div className="flex-grow relative">
        <div className="absolute top-24 right-4 z-10 flex flex-col gap-2">
            {mapViewMode !== 'locked' && (
              <button
                  onClick={() => setMapViewMode('locked')}
                  className="w-12 h-12 bg-slate-800/80 backdrop-blur-sm rounded-full flex items-center justify-center text-3xl hover:bg-slate-700 shadow-lg"
                  aria-label="إعادة التمركز والتتبع"
                  title="إعادة التمركز والتتبع"
              >
                  🖼️
              </button>
            )}
             <button
                onClick={() => setMapViewMode(mapViewMode === 'navigation' ? 'locked' : 'navigation')}
                disabled={typeof startLocation?.heading !== 'number'}
                className={`w-12 h-12 rounded-full flex items-center justify-center text-3xl shadow-lg
                    ${mapViewMode === 'navigation' ? 'bg-primary text-white' : 'bg-slate-800/80 backdrop-blur-sm hover:bg-slate-700'}
                    disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label="وضع الملاحة"
                title="وضع الملاحة"
            >
                🧭
            </button>
        </div>

        <div className={`absolute inset-0 transition-transform duration-500 ease-in-out ${canNavigate ? 'navigation-view' : ''}`}>
           <InteractiveMap
                center={mapCenterCoords}
                zoom={15}
                startLocation={currentRide?.startLocation || startLocation || undefined}
                endLocation={currentRide?.endLocation || endLocation || undefined}
                userLocation={startLocation || undefined}
                driverLocation={assignedDriver?.location}
                routes={mapRoutes}
                navigationMode={{ enabled: canNavigate, bearing: startLocation?.heading ?? 0 }}
                onCenterChange={pinDropMode ? setMapCenter : undefined}
                disableAutoPanZoom={mapViewMode !== 'locked' || pinDropMode !== null || canNavigate}
                onUserInteraction={handleUserInteraction}
            >
                {onlineDrivers.filter(d => !assignedDriver || d.id !== assignedDriver.id).map(driver => (
                    <InteractiveMap.DriverMarker
                        key={driver.id}
                        position={[driver.location!.lat, driver.location!.lng]}
                        popupContent={`
                            <strong>${driver.name}</strong><br/>
                            المركبة: ${VEHICLE_TYPES.find(v => v.id === driver.vehicle.type)?.ar || ''}<br/>
                            التقييم: ${driver.rating} ★
                        `}
                    />
                ))}
            </InteractiveMap>
        </div>
        
        {pinDropMode && (
          <>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="#EF4444" className="drop-shadow-lg">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/>
                </svg>
            </div>
            <div className="absolute bottom-24 inset-x-4 z-20 flex justify-center gap-4">
                <button
                    onClick={handleConfirmPinDrop}
                    className="px-8 py-3 bg-primary text-white font-bold rounded-full shadow-lg hover:bg-primary-dark transform hover:scale-105"
                >
                    تأكيد الموقع المحدد
                </button>
                 <button
                    onClick={() => setPinDropMode(null)}
                    className="px-6 py-3 bg-slate-600 text-white font-bold rounded-full shadow-lg hover:bg-slate-500"
                >
                    إلغاء
                </button>
            </div>
          </>
        )}
      </div>

      {!currentRide && !pinDropMode && (
          <div 
              className={`absolute bottom-0 right-0 left-0 bg-slate-800/95 backdrop-blur-sm shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.3)] z-20 transition-transform duration-300 ease-out rounded-t-2xl
                  ${isPanelExpanded ? 'translate-y-0' : 'translate-y-[calc(100%-80px)]'}`
              }
          >
              <button 
                  onClick={() => setIsPanelExpanded(!isPanelExpanded)}
                  className="w-full py-4 text-center"
              >
                  <span className={`inline-block w-10 h-1.5 bg-slate-500 rounded-full transition-transform ${isPanelExpanded ? 'rotate-180' : ''}`}></span>
              </button>

              <div className="p-4 pt-0">
                  {currentStep === 'setDestination' && (
                      <div className="space-y-4 animate-fade-in-up">
                          <h2 className="text-xl font-bold">إلى أين تريد الذهاب؟</h2>
                          <div className="relative">
                              <input 
                                  type="text" 
                                  placeholder="نقطة الانطلاق" 
                                  value={startQuery}
                                  onChange={(e) => { setStartQuery(e.target.value); setActiveInput('start'); }}
                                  onFocus={() => setActiveInput('start')}
                                  disabled={isLocating}
                                  className="w-full p-3 bg-slate-700 rounded-lg pr-12"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-primary">📍</span>
                              {startSuggestions.length > 0 && activeInput === 'start' && (
                                  <ul className="absolute bottom-full mb-1 w-full bg-slate-600 rounded-lg z-30 max-h-40 overflow-y-auto">
                                      {startSuggestions.map(s => <li key={s.name} onClick={() => handleSuggestionSelect(s, 'start')} className="p-3 hover:bg-slate-500 cursor-pointer">{s.name}</li>)}
                                  </ul>
                              )}
                          </div>
                          <div className="relative">
                              <input 
                                  type="text" 
                                  placeholder="الوجهة"
                                  value={endQuery}
                                  onChange={(e) => { setEndQuery(e.target.value); setActiveInput('end'); }}
                                  onFocus={() => setActiveInput('end')}
                                  className="w-full p-3 bg-slate-700 rounded-lg pr-12"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500">📍</span>
                              {endSuggestions.length > 0 && activeInput === 'end' && (
                                  <ul className="absolute bottom-full mb-1 w-full bg-slate-600 rounded-lg z-30 max-h-40 overflow-y-auto">
                                      {endSuggestions.map(s => <li key={s.name} onClick={() => handleSuggestionSelect(s, 'end')} className="p-3 hover:bg-slate-500 cursor-pointer">{s.name}</li>)}
                                  </ul>
                              )}
                          </div>
                          <div className="flex gap-2 text-center text-sm">
                            <button onClick={() => { setPinDropMode('start'); setIsPanelExpanded(false); }} className="flex-1 py-2 bg-slate-700/80 rounded-lg hover:bg-slate-600">حدد الانطلاق على الخريطة</button>
                            <button onClick={() => { setPinDropMode('end'); setIsPanelExpanded(false); }} className="flex-1 py-2 bg-slate-700/80 rounded-lg hover:bg-slate-600">حدد الوجهة على الخريطة</button>
                          </div>

                          {isLoadingRoute && <p className="text-center text-primary animate-pulse">جاري حساب المسار...</p>}
                          {routeError && <p className="text-center text-red-400 p-2 bg-red-900/50 rounded-lg">{routeError}</p>}
                      </div>
                  )}

                  {currentStep === 'selectVehicle' && routeInfo && (
                      <div className="animate-fade-in-up">
                          <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">اختر نوع المركبة</h2>
                            <button onClick={() => setCurrentStep('setDestination')} className="text-sm text-slate-400 hover:text-white">تعديل</button>
                          </div>
                          <p className="text-center mb-4 bg-slate-700/50 p-2 rounded-lg">المسافة: {routeInfo.distance.toFixed(1)} كم | الزمن التقريبي: {Math.round(routeInfo.duration)} دقيقة</p>
                          <div className="grid grid-cols-3 gap-2 text-center">
                              {VEHICLE_TYPES.map(vt => {
                                  const fare = getEstimatedFare(vt.id, routeInfo.distance, routeInfo.duration);
                                  return (
                                      <button key={vt.id} onClick={() => handleVehicleSelect(vt.id)} className="p-3 bg-slate-700 rounded-lg hover:bg-slate-600/80 hover:border-primary border-2 border-transparent">
                                          <div className="text-4xl">{vt.icon}</div>
                                          <div className="font-semibold">{vt.ar}</div>
                                          <div className="text-xs text-slate-300">{fare.toLocaleString('ar-SY')} ل.س</div>
                                      </button>
                                  )
                              })}
                          </div>
                      </div>
                  )}

                  {currentStep === 'confirmRequest' && selectedVehicle && routeInfo && (
                      <div className="animate-fade-in-up">
                          <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">تأكيد الطلب</h2>
                            <button onClick={() => setCurrentStep('selectVehicle')} className="text-sm text-slate-400 hover:text-white">رجوع</button>
                          </div>
                          <div className="bg-slate-700/50 p-4 rounded-lg text-center space-y-2">
                              <p>من: {startLocation?.name}</p>
                              <p>إلى: {endLocation?.name}</p>
                              <p>المركبة: {VEHICLE_TYPES.find(v => v.id === selectedVehicle)?.ar}</p>
                              <p className="font-bold text-lg">الأجرة التقديرية: {getEstimatedFare(selectedVehicle, routeInfo.distance, routeInfo.duration).toLocaleString('ar-SY')} ل.س</p>
                          </div>
                           <div className="mt-4 flex items-center justify-center gap-4">
                               <label className="flex items-center space-x-2 rtl:space-x-reverse cursor-pointer">
                                   <input type="checkbox" checked={isScheduling} onChange={(e) => setIsScheduling(e.target.checked)} className="form-checkbox h-5 w-5 bg-slate-600 border-slate-500 text-primary focus:ring-primary"/>
                                   <span>جدولة الرحلة</span>
                               </label>
                               {isScheduling && (
                                   <input 
                                       type="datetime-local" 
                                       value={scheduledTime}
                                       onChange={e => setScheduledTime(e.target.value)}
                                       className="p-2 bg-slate-700 rounded border border-slate-600 text-white"
                                       style={{ colorScheme: 'dark' }}
                                   />
                               )}
                           </div>
                          <button 
                              onClick={handleRequestRide} 
                              className="w-full mt-4 py-4 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark"
                              disabled={isScheduling && !scheduledTime}
                          >
                            {isScheduling ? 'تأكيد الجدولة' : 'اطلب الآن'}
                          </button>
                      </div>
                  )}
              </div>
          </div>
      )}

      {currentRide && !canNavigate && (
          <div className="absolute bottom-4 right-4 z-20">
              <button onClick={() => cancelRide(currentRide.id)} className="px-6 py-3 bg-red-600 text-white font-bold rounded-full shadow-lg hover:bg-red-700">إلغاء الرحلة</button>
          </div>
      )}
    </div>
  );
};

export default CustomerPage;