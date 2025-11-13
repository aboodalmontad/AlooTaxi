import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRide } from '../contexts/RideContext';
import InteractiveMap from '../components/InteractiveMap';
import { DAMASCUS_COORDS, VEHICLE_TYPES, PROVINCE_COORDS, SYRIAN_PROVINCES } from '../constants';
import { RideStatus, RouteInfo, VehicleType, LocationSuggestion, Ride, SyrianProvinces, Driver } from '../types';
import { getRoute, searchLocations, getHaversineDistance } from '../services/mapService';
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

    const province = user?.province || SyrianProvinces.DAMASCUS;
    const provinceCoords = PROVINCE_COORDS[province] || DAMASCUS_COORDS;
    const provinceName = SYRIAN_PROVINCES.find(p => p.id === province)?.ar || 'دمشق';
    
    const fallbackLocation = { lat: provinceCoords[0], lng: provinceCoords[1], name: `وسط ${provinceName}`, heading: null };

    if (!navigator.geolocation) {
        setStartLocation(fallbackLocation);
        setStartQuery(fallbackLocation.name);
        setLocationError("خدمات الموقع الجغرافي غير مدعومة في متصفحك.");
        setIsLocating(false);
        return;
    }

    const setFinalLocation = (position: GeolocationPosition, name: string) => {
        const { latitude, longitude, heading } = position.coords;
        const newLocation = { lat: latitude, lng: longitude, name, heading };
        setStartLocation(newLocation);
        setStartQuery(name);
        setLocationError(null);
        setLocationWarning(null);
        setIsLocating(false);
        setMapViewMode('locked');
    };

    const finalErrorHandler = (error: GeolocationPositionError) => {
        let message = "";
        switch (error.code) {
            case error.PERMISSION_DENIED: message = "تم رفض إذن الوصول إلى الموقع. يرجى تفعيله من إعدادات المتصفح."; break;
            case error.POSITION_UNAVAILABLE: message = "تعذر تحديد موقعك الحالي. قد تكون إشارة GPS أو الشبكة ضعيفة."; break;
            case error.TIMEOUT: message = "انتهت مهلة طلب تحديد الموقع."; break;
            default: message = "حدث خطأ غير متوقع."; break;
        }
        setStartLocation(fallbackLocation);
        setStartQuery(fallbackLocation.name);
        setLocationError(`${message} سيتم استخدام موقع افتراضي.`);
        setIsLocating(false);
    };

    // Step 1: Try for a quick, network-based location
    navigator.geolocation.getCurrentPosition(
        (position) => {
            // Got a quick position, show it and then try to improve it.
            const { latitude, longitude, heading } = position.coords;
            setStartLocation({ lat: latitude, lng: longitude, name: "موقع تقريبي...", heading });
            setStartQuery("موقع تقريبي...");
            setLocationWarning("جاري تحسين دقة الموقع...");
            setMapViewMode('locked');

            // Step 2: Now try for a high-accuracy position in the background.
            navigator.geolocation.getCurrentPosition(
                (highAccuracyPosition) => {
                    setFinalLocation(highAccuracyPosition, "موقعي الحالي");
                },
                (highAccuracyError) => {
                    console.warn("High-accuracy failed, using initial position.", highAccuracyError);
                    setFinalLocation(position, "موقعي الحالي (دقة شبكة)");
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        },
        (lowAccuracyError) => {
            // The quick attempt failed, let's try a single, more patient high-accuracy attempt.
            console.warn("Low-accuracy failed, trying high-accuracy directly.", lowAccuracyError);
            setStartQuery("...جاري الحصول على موقع دقيق");
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setFinalLocation(position, "موقعي الحالي");
                },
                finalErrorHandler, // If this last attempt fails, show the final error.
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
            );
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
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
        if (startLocation && endLocation) {
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
            let origin = startLocation;
            let destination = currentRide.endLocation;

            if (currentRide.status === RideStatus.PICKING_UP && driverLocation) {
                // For customer, nav route is from driver to them, until pickup
                origin = driverLocation;
                destination = currentRide.startLocation;
            } else if (currentRide.status === RideStatus.IN_PROGRESS) {
                // Then from their current location to destination
                origin = startLocation;
                destination = currentRide.endLocation;
            } else {
                return;
            }

            const route = await getRoute(origin, destination);
            setNavigationRoute(route);

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
                className={`w-12 h-12 backdrop-blur-sm rounded-full flex items-center justify-center text-3xl shadow-lg transition-colors ${mapViewMode === 'navigation' ? 'bg-primary text-white' : 'bg-slate-800/80 hover:bg-slate-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label="تبديل وضع الملاحة"
                title={typeof startLocation?.heading !== 'number' ? 'وضع الملاحة غير متاح (تحرك لعرض الاتجاه)' : 'تبديل وضع الملاحة'}
            >
                🧭
            </button>
        </div>

        <InteractiveMap 
          center={mapCenterCoords}
          userLocation={startLocation ?? undefined}
          driverLocation={assignedDriver?.location ?? undefined}
          startLocation={currentRide?.status !== RideStatus.IDLE ? currentRide?.startLocation : startLocation ?? undefined}
          endLocation={currentRide?.status !== RideStatus.IDLE ? currentRide?.endLocation : endLocation ?? undefined}
          routes={mapRoutes}
          onCenterChange={setMapCenter}
          disableAutoPanZoom={mapViewMode !== 'locked' || !!pinDropMode || canNavigate}
          onUserInteraction={handleUserInteraction}
          navigationMode={{
              enabled: canNavigate,
              bearing: startLocation?.heading ?? 0,
          }}
        />
      </div>

      {/* --- START: Pin Drop UI --- */}
      {pinDropMode && (
        <>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-10 pointer-events-none">
                <div className="relative flex flex-col items-center animate-bounce">
                    <span className="text-5xl drop-shadow-lg">📍</span>
                    <div className="w-3 h-3 bg-black/30 rounded-full shadow-md -mt-2"></div>
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4 bg-slate-800/90 backdrop-blur-sm z-20 rounded-t-2xl shadow-lg animate-fade-in-up">
                <p className="text-center text-slate-300 mb-3">حرّك الخريطة لوضع الدبوس في الموقع المطلوب ثم اضغط تأكيد.</p>
                <div className="flex gap-4">
                    <button onClick={handleConfirmPinDrop} className="flex-1 py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark">
                        تأكيد الموقع
                    </button>
                    <button onClick={() => setPinDropMode(null)} className="flex-1 py-3 bg-slate-600 text-white rounded-lg hover:bg-slate-500">
                        إلغاء
                    </button>
                </div>
            </div>
        </>
      )}
      {/* --- END: Pin Drop UI --- */}

      {/* --- Booking Panel --- */}
      { !currentRide && !pinDropMode &&
      <div 
        className="absolute bottom-0 right-0 left-0 z-10 transition-transform duration-300 ease-in-out"
        style={{ transform: isPanelExpanded ? 'translateY(0)' : 'translateY(calc(100% - 60px))' }}
      >
        <div className="bg-slate-800/90 backdrop-blur-sm shadow-2xl rounded-t-2xl">
            <div 
                className="w-full h-[60px] flex items-center justify-center cursor-pointer group"
                onClick={() => setIsPanelExpanded(!isPanelExpanded)}
                role="button"
                aria-expanded={isPanelExpanded}
                aria-label={isPanelExpanded ? "إخفاء لوحة الطلب" : "إظهار لوحة الطلب"}
            >
                <div className="w-10 h-1 bg-slate-500 rounded-full group-hover:bg-primary transition-colors"></div>
            </div>
            
            <div className="p-4 pt-0">
              {currentStep === 'setDestination' && (
                  <div className="space-y-3">
                      <h2 className="text-lg font-semibold text-center">اطلب رحلتك الآن</h2>
                       <div className="relative">
                           <input 
                               type="text"
                               value={startQuery}
                               onChange={e => {
                                   setStartQuery(e.target.value);
                                   setRouteError(null);
                                   setLocationError(null);
                                   setLocationWarning(null);
                               }}
                               onFocus={() => setActiveInput('start')}
                               placeholder="نقطة الانطلاق"
                               className="w-full p-3 pl-20 bg-slate-700 rounded-lg"
                               disabled={isLocating}
                           />
                           <div className="absolute left-1 top-1/2 -translate-y-1/2 flex items-center">
                                <button onClick={() => setPinDropMode('start')} className="p-2 text-2xl" title="تحديد على الخريطة">📍</button>
                                <button onClick={() => fetchUserLocation(true)} disabled={isLocating} className="p-2 text-2xl" title="تحديد موقعي الحالي">🎯</button>
                           </div>
                           {activeInput === 'start' && startSuggestions.length > 0 && (
                               <ul className="absolute bottom-full left-0 right-0 bg-slate-600 rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto mb-1">
                                   {startSuggestions.map(s => <li key={s.name + s.coordinates.lat} onClick={() => handleSuggestionSelect(s, 'start')} className="p-2 hover:bg-primary cursor-pointer">{s.name}</li>)}
                               </ul>
                           )}
                       </div>
                       <div className="relative">
                           <input 
                               type="text"
                               value={endQuery}
                               onChange={e => {
                                   setEndQuery(e.target.value);
                                   setRouteError(null);
                               }}
                               onFocus={() => setActiveInput('end')}
                               placeholder="إلى أين تريد الذهاب؟"
                               className="w-full p-3 pl-12 bg-slate-700 rounded-lg"
                           />
                           <button onClick={() => setPinDropMode('end')} className="absolute left-1 top-1/2 -translate-y-1/2 p-2 text-2xl" title="تحديد على الخريطة">📍</button>
                           {activeInput === 'end' && endSuggestions.length > 0 && (
                               <ul className="absolute bottom-full left-0 right-0 bg-slate-600 rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto mb-1">
                                   {endSuggestions.map(s => <li key={s.name + s.coordinates.lat} onClick={() => handleSuggestionSelect(s, 'end')} className="p-2 hover:bg-primary cursor-pointer">{s.name}</li>)}
                               </ul>
                           )}
                       </div>
                       { isLoadingRoute && <p className="text-center text-slate-300">جاري حساب المسار...</p> }
                       { routeError && <p className="text-center text-red-400 mt-2">{routeError}</p>}
                  </div>
              )}

              {currentStep === 'selectVehicle' && routeInfo && (
                  <div>
                      <h2 className="text-lg font-semibold mb-3 text-center">اختر وسيلة النقل</h2>
                      <div className="flex overflow-x-auto space-x-3 rtl:space-x-reverse pb-3 scrollbar-hide">
                          {VEHICLE_TYPES.map(v => {
                              const fare = getEstimatedFare(v.id, routeInfo.distance, routeInfo.duration);
                              return (
                                <button 
                                    key={v.id} 
                                    onClick={() => handleVehicleSelect(v.id)} 
                                    className={`flex-shrink-0 w-28 text-center p-3 rounded-xl transition-all duration-200 transform hover:-translate-y-1 bg-slate-700/80 hover:bg-slate-600/80`}
                                  >
                                      <span className="text-4xl">{v.icon}</span>
                                      <p className="mt-1 font-semibold">{v.ar}</p>

                                      <p className="text-sm text-slate-300">{fare.toLocaleString('ar-SY', { style: 'currency', currency: 'SYP', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                                </button>
                              );
                          })}
                      </div>
                      <button onClick={() => { setEndLocation(null); setEndQuery(''); setRouteInfo(null); setCurrentStep('setDestination'); }} className="w-full mt-2 py-2 text-sm text-slate-300 hover:text-white">العودة</button>
                  </div>
              )}

              {currentStep === 'confirmRequest' && routeInfo && selectedVehicle && (
                  <div className="text-center">
                      <h2 className="text-lg font-semibold mb-2">تأكيد الطلب</h2>
                      <div className="bg-slate-700 p-3 rounded-lg text-right space-y-1 mb-3">
                          <p><span className="font-semibold">من:</span> {startLocation?.name}</p>
                          <p><span className="font-semibold">إلى:</span> {endLocation?.name}</p>
                          <p><span className="font-semibold">المركبة:</span> {VEHICLE_TYPES.find(v => v.id === selectedVehicle)?.ar}</p>
                          <p><span className="font-semibold">الأجرة التقديرية:</span> {getEstimatedFare(selectedVehicle, routeInfo.distance, routeInfo.duration).toLocaleString('ar-SY', { style: 'currency', currency: 'SYP', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                      </div>
                      
                      <div className="flex items-center justify-center my-3">
                          <input type="checkbox" id="schedule" checked={isScheduling} onChange={(e) => setIsScheduling(e.target.checked)} className="h-4 w-4 text-primary bg-slate-600 border-slate-500 rounded focus:ring-primary"/>
                          <label htmlFor="schedule" className="mr-2 text-sm">جدولة الرحلة لوقت لاحق؟</label>
                      </div>

                      {isScheduling && (
                          <input 
                              type="datetime-local" 
                              value={scheduledTime}
                              onChange={e => setScheduledTime(e.target.value)}
                              className="w-full p-2 bg-slate-700 rounded-lg mb-3"
                          />
                      )}

                      <button onClick={handleRequestRide} className="w-full py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark">
                          {isScheduling ? 'جدولة وتأكيد' : 'تأكيد الطلب الآن'}
                      </button>
                      <button onClick={() => setCurrentStep('selectVehicle')} className="w-full mt-2 py-2 text-sm text-slate-300 hover:text-white">العودة لاختيار المركبة</button>
                  </div>
              )}
            </div>
        </div>
      </div>
      }
    </div>
  );
};

export default CustomerPage;