import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRide } from '../contexts/RideContext';
import InteractiveMap from '../components/InteractiveMap';
import { DAMASCUS_COORDS, VEHICLE_TYPES, PROVINCE_COORDS, SYRIAN_PROVINCES } from '../constants';
import { RideStatus, RouteInfo, VehicleType, LocationSuggestion, Ride, SyrianProvinces } from '../types';
import { getRoute, searchLocations } from '../services/mapService';
import LiveTripDisplay from '../components/LiveTripDisplay';

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

const isLocationInSyria = (lat: number, lng: number) => {
    // Expanded bounds to be more forgiving of GPS inaccuracies near borders.
    const SYRIA_BOUNDS = {
        minLat: 31.8,
        maxLat: 37.7,
        minLng: 35.3,
        maxLng: 42.7,
    };
    return lat >= SYRIA_BOUNDS.minLat && lat <= SYRIA_BOUNDS.maxLat &&
           lng >= SYRIA_BOUNDS.minLng && lng <= SYRIA_BOUNDS.maxLng;
};


const CustomerPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { ride, requestRide, cancelRide, getEstimatedFare, driverLiveLocation, liveTripData } = useRide();
  
  // Location and Route State
  const [startLocation, setStartLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [endLocation, setEndLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  
  // UI and Flow State
  const [currentStep, setCurrentStep] = useState('setDestination'); // setDestination, selectVehicle, confirmRequest
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  
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

  const fetchUserLocation = useCallback(() => {
    setIsLocating(true);
    setStartQuery("...جاري تحديد الموقع");
    setRouteInfo(null);
    setRouteError(null);
    setLocationError(null);

    const handleLocationError = (message: string, isPermissionError = false) => {
        const province = user?.province || SyrianProvinces.DAMASCUS;
        const provinceName = SYRIAN_PROVINCES.find(p => p.id === province)?.ar || 'دمشق';
        const provinceCoords = PROVINCE_COORDS[province] || DAMASCUS_COORDS;
        const defaultLocation = { 
            lat: provinceCoords[0], 
            lng: provinceCoords[1], 
            name: `وسط ${provinceName}`
        };
        
        setStartLocation(defaultLocation);
        setStartQuery(defaultLocation.name);
        
        let fullMessage = `${message} سيتم استخدام موقع افتراضي في ${provinceName}.`;
        if (isPermissionError) {
            fullMessage += " يرجى تفعيل إذن الموقع في إعدادات المتصفح ثم تحديث الصفحة.";
        }
        setLocationError(fullMessage);
        setIsLocating(false);
    };

    if (!navigator.geolocation) {
        handleLocationError("خدمات الموقع الجغرافي غير مدعومة في متصفحك.");
        return;
    }

    new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 20000, // Increased timeout for better results
            maximumAge: 0,
        });
    })
    .then(position => {
        const { latitude, longitude } = position.coords;
        if (isLocationInSyria(latitude, longitude)) {
            setLocationError(null);
            const newLocation = { 
                lat: latitude, 
                lng: longitude,
                name: "موقعي الحالي"
            };
            setStartLocation(newLocation);
            setStartQuery("موقعي الحالي");
            setIsLocating(false);
        } else {
            handleLocationError("تم تحديد موقع خارج النطاق الجغرافي للخدمة.", false);
            console.warn(`Geolocation API returned coordinates outside Syria for customer: ${latitude}, ${longitude}`);
        }
    })
    .catch((error: GeolocationPositionError) => {
        let message = "";
        let isPermissionError = false;
        switch (error.code) {
            case error.PERMISSION_DENIED:
                message = "تم رفض إذن الوصول إلى الموقع.";
                isPermissionError = true;
                break;
            case error.POSITION_UNAVAILABLE:
                message = "تعذر تحديد موقعك الحالي. يرجى التأكد من أن إشارة GPS قوية.";
                break;
            case error.TIMEOUT:
                message = "انتهت مهلة طلب تحديد الموقع. يرجى المحاولة مرة أخرى.";
                break;
            default:
                message = "حدث خطأ غير متوقع أثناء محاولة تحديد موقعك.";
                break;
        }
        handleLocationError(message, isPermissionError);
    });
  }, [user]);

  const resetJourney = useCallback(() => {
      setStartLocation(null);
      setStartQuery('');
      setEndLocation(null);
      setEndQuery('');
      setRouteInfo(null);
      setRouteError(null);
      setLocationError(null);
      setCurrentStep('setDestination');
      setSelectedVehicle(null);
      setIsScheduling(false);
      setScheduledTime('');
  }, []);


  // Effect to get initial user location on component mount or after a reset
  useEffect(() => {
    if (!startLocation) {
      fetchUserLocation();
    }
  }, [fetchUserLocation, startLocation]);

  // Effect to reset UI after a ride is completed
  useEffect(() => {
    // When the ride is completed and then cleared from the context, reset the UI for a new ride.
    if ((prevRideRef.current?.status === RideStatus.COMPLETED || prevRideRef.current?.status === RideStatus.CANCELLED) && !ride) {
      resetJourney();
    }
    // Store the current ride state for the next render to detect the change.
    prevRideRef.current = ride;
  }, [ride, resetJourney]);


  // Effect for fetching start location suggestions
  useEffect(() => {
    if (debouncedStartQuery && debouncedStartQuery !== 'موقعي الحالي' && !debouncedStartQuery.startsWith('وسط ') && activeInput === 'start') {
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
    if (debouncedEndQuery && activeInput === 'end') {
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
  
  const handleSuggestionSelect = (suggestion: LocationSuggestion, type: 'start' | 'end') => {
    const newLocation = {
        lat: suggestion.coordinates.lat,
        lng: suggestion.coordinates.lng,
        name: suggestion.name,
    };
    if (type === 'start') {
        setStartLocation(newLocation);
        setStartQuery(suggestion.name);
        setStartSuggestions([]);
        setLocationError(null);
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

  const RideStatusIndicator = () => {
    if (!ride || ride.status === RideStatus.IN_PROGRESS) return null; // IN_PROGRESS is handled by LiveTripDisplay
    let message = "";
    switch(ride.status) {
        case RideStatus.REQUESTED: message = ride.isScheduled ? `تم جدولة رحلتك بنجاح! سيتم البحث عن سائق في ${ride.scheduledTime}` : "جاري البحث عن سائق..."; break;
        case RideStatus.ACCEPTED: message = `تم العثور على سائق! السائق في طريقه إليك.`; break;
        case RideStatus.PICKING_UP: message = "السائق يقترب من موقعك."; break;
        case RideStatus.COMPLETED: message = `اكتملت الرحلة! الأجرة النهائية: ${ride.finalFare?.toLocaleString('ar-SY', { style: 'currency', currency: 'SYP' })}`; break;
        case RideStatus.CANCELLED: message = "تم إلغاء الرحلة."; break;
        default: return null;
    }
    return (
        <div className="absolute top-20 right-4 left-4 bg-primary/90 backdrop-blur-sm text-white p-4 rounded-lg shadow-lg text-center z-10 animate-fade-in-down">
            <p className="font-bold">{message}</p>
            {(ride.status === RideStatus.ACCEPTED || ride.status === RideStatus.PICKING_UP) &&
                <div className="text-sm mt-2">
                    <p>بيانات السائق: سامر السائق - كيا ريو (321789)</p>
                    <p>رقم الهاتف: 0987654321</p>
                </div>
            }
        </div>
    );
  }

  const userProvince = user?.province || SyrianProvinces.DAMASCUS;
  const provinceCenter = PROVINCE_COORDS[userProvince] || DAMASCUS_COORDS;

  return (
    <div className="h-screen w-screen flex flex-col relative overflow-hidden">
      <header className="absolute top-0 left-0 right-0 bg-gradient-to-b from-slate-900/80 to-transparent p-4 flex justify-between items-center z-20">
        <h1 className="text-2xl font-bold text-primary">ألو تكسي</h1>
        <div>
          <span className="ml-4">أهلاً، {user?.name}</span>
          <button onClick={logout} className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700">خروج</button>
        </div>
      </header>

      {locationError && (
        <div className="absolute top-20 right-4 left-4 bg-red-800/95 backdrop-blur-sm p-4 rounded-lg shadow-lg z-10 text-center animate-fade-in-down">
            <p className="font-bold">خطأ في تحديد الموقع</p>
            <p>{locationError}</p>
        </div>
      )}

      {ride?.status === RideStatus.IN_PROGRESS && liveTripData ? (
          <div className="absolute inset-x-0 top-0 z-10 pt-20">
              <LiveTripDisplay {...liveTripData} />
          </div>
      ) : (
          <RideStatusIndicator />
      )}

      <div className="flex-grow relative">
        <InteractiveMap 
          center={startLocation ? [startLocation.lat, startLocation.lng] : provinceCenter}
          userLocation={ride?.status === RideStatus.IN_PROGRESS ? driverLiveLocation ?? undefined : startLocation ?? undefined}
          driverLocation={driverLiveLocation ?? undefined}
          startLocation={ride?.status !== RideStatus.IDLE ? ride?.startLocation : startLocation ?? undefined}
          endLocation={ride?.status !== RideStatus.IDLE ? ride?.endLocation : endLocation ?? undefined}
          routePolyline={ride?.polyline || routeInfo?.polyline}
        />
      </div>

      {/* --- Booking Panel --- */}
      { !ride &&
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
                               }}
                               onFocus={() => setActiveInput('start')}
                               placeholder="نقطة الانطلاق"
                               className="w-full p-3 pl-10 bg-slate-700 rounded-lg"
                               disabled={isLocating}
                           />
                           <button onClick={fetchUserLocation} disabled={isLocating} className="absolute left-2 top-1/2 -translate-y-1/2 text-2xl" title="تحديد موقعي الحالي">🎯</button>
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
                               className="w-full p-3 bg-slate-700 rounded-lg"
                           />
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