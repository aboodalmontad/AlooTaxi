import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRide } from '../contexts/RideContext';
import InteractiveMap from '../components/InteractiveMap';
import { DAMASCUS_COORDS, VEHICLE_TYPES, PROVINCE_COORDS, SYRIAN_PROVINCES } from '../constants';
import { RideStatus, Driver, RouteInfo, Ride, SyrianProvinces } from '../types';
import { getRoute } from '../services/mapService';
import LiveTripDisplay from '../components/LiveTripDisplay';

const isLocationInSyria = (lat: number, lng: number) => {
    // Greatly expanded bounds to be extremely forgiving of GPS inaccuracies.
    const SYRIA_BOUNDS = {
        minLat: 31.0,
        maxLat: 38.5,
        minLng: 34.5,
        maxLng: 43.5,
    };
    return lat >= SYRIA_BOUNDS.minLat && lat <= SYRIA_BOUNDS.maxLat &&
           lng >= SYRIA_BOUNDS.minLng && lng <= SYRIA_BOUNDS.maxLng;
};

const DriverPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { ride, acceptRide, completeRide, updateRideStatus, updateDriverLocation, liveTripData } = useRide();
  const [isOnline, setIsOnline] = useState(true);
  const [displayPolyline, setDisplayPolyline] = useState<[number, number][] | undefined>(undefined);
  const [driverLocation, setDriverLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [pickupRouteInfo, setPickupRouteInfo] = useState<RouteInfo | null>(null);
  const [currentLegInfo, setCurrentLegInfo] = useState<RouteInfo | null>(null);

  const [lastCompletedRide, setLastCompletedRide] = useState<Ride | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showEndTripConfirmation, setShowEndTripConfirmation] = useState(false);
  const [isManualLocating, setIsManualLocating] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  
  const driver = user as Driver;
  
  const fetchInitialDriverLocation = useCallback(() => {
    const handleLocationError = (message: string, forceOffline = false, isPermissionError = false) => {
        const province = driver?.province || SyrianProvinces.DAMASCUS;
        const provinceName = SYRIAN_PROVINCES.find(p => p.id === province)?.ar || 'دمشق';
        const provinceCoords = PROVINCE_COORDS[province] || DAMASCUS_COORDS;
        const defaultLocation = { lat: provinceCoords[0], lng: provinceCoords[1] };

        // Set location only if it's not already set, to avoid overwriting a good location from watchPosition
        setDriverLocation(current => current ?? defaultLocation);
        updateDriverLocation(defaultLocation);
        
        let fullMessage = `${message} سيتم استخدام موقع افتراضي في ${provinceName}.`;
        if (isPermissionError) {
            fullMessage += " يرجى تفعيل إذن الموقع في إعدادات المتصفح ثم تحديث الصفحة.";
        }
        setLocationError(fullMessage);

        if (forceOffline) {
            setIsOnline(false);
        }
    };

    if (!navigator.geolocation) {
        handleLocationError("خدمات الموقع غير مدعومة. لا يمكنك العمل كسائق.", true);
        return;
    }

    new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 20000,
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
            };
            setDriverLocation(newLocation);
            updateDriverLocation(newLocation);
        } else {
             handleLocationError("تم تحديد موقع خارج النطاق الجغرافي للخدمة.", false, false);
             console.warn(`Geolocation API returned coordinates outside Syria: ${latitude}, ${longitude}`);
        }
    })
    .catch((error: GeolocationPositionError) => {
        let message = "";
        let forceOffline = false;
        let isPermissionError = false;
        switch (error.code) {
            case error.PERMISSION_DENIED:
                message = "تم رفض إذن الوصول إلى الموقع. يجب تفعيله للعمل كسائق.";
                forceOffline = true;
                isPermissionError = true;
                break;
            case error.POSITION_UNAVAILABLE:
                message = "إشارة GPS ضعيفة أو غير متاحة. سيتم استخدام موقع افتراضي.";
                break;
            case error.TIMEOUT:
                message = "انتهت مهلة طلب تحديد الموقع. يرجى التحقق من اتصالك.";
                break;
            default:
                message = "حدث خطأ غير متوقع أثناء محاولة تحديد موقعك.";
                break;
        }
        handleLocationError(message, forceOffline, isPermissionError);
    });
  }, [driver, updateDriverLocation]);


  // Effect for initial location fetch
  useEffect(() => {
    if (isOnline && !driverLocation) {
        fetchInitialDriverLocation();
    }
  }, [isOnline, driverLocation, fetchInitialDriverLocation]);


  // Effect for real-time location tracking (continuous watch)
  useEffect(() => {
    if (!isOnline || !driverLocation) { // Only start watching if online AND initial location is set
      if (watchIdRef.current && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    const success = (position: GeolocationPosition) => {
        const { latitude, longitude } = position.coords;
        if (isLocationInSyria(latitude, longitude)) {
            setLocationError(null); // Clear any intermittent error on success
            const newLocation = {
                lat: latitude,
                lng: longitude,
            };
            setDriverLocation(newLocation);
            updateDriverLocation(newLocation);
        } else {
            console.warn(`watchPosition received an out-of-bounds location, ignoring update: ${latitude}, ${longitude}`);
            setLocationError("تم استلام موقع خارج منطقة الخدمة. يتم تجاهل التحديث.");
        }
    };

    const error = (err: GeolocationPositionError) => {
        let message = "";
        switch (err.code) {
            case err.PERMISSION_DENIED:
                message = "تم رفض إذن الموقع. تم إيقاف التتبع المباشر.";
                setIsOnline(false); // Force offline
                break;
            case err.POSITION_UNAVAILABLE:
                message = "إشارة GPS ضعيفة. جاري محاولة إعادة الاتصال...";
                break;
            case err.TIMEOUT:
                message = "انتهت مهلة تحديث الموقع. تحقق من اتصالك.";
                break;
            default:
                message = "حدث خطأ في تتبع الموقع.";
                break;
        }
        setLocationError(message);
    };
    
    // Start watching for position changes only after initial location is confirmed
    if (navigator.geolocation && !watchIdRef.current) {
        watchIdRef.current = navigator.geolocation.watchPosition(success, error, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
        });
    }

    return () => {
      if (watchIdRef.current && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isOnline, driverLocation, updateDriverLocation]);


  // Effect to calculate route to pickup point for new requests
  useEffect(() => {
    if (ride?.status === RideStatus.REQUESTED && driverLocation && isOnline) {
      const calculatePickupRoute = async () => {
        try {
          const route = await getRoute(driverLocation, ride.startLocation);
          setPickupRouteInfo(route);
        } catch (err) {
          console.error("Failed to calculate route to pickup:", err);
          setPickupRouteInfo(null);
        }
      };
      calculatePickupRoute();
    } else {
      setPickupRouteInfo(null);
    }
  }, [ride, driverLocation, isOnline]);

  // Effect to calculate and display route for active trip stages
  useEffect(() => {
    const calculateAndSetRoute = async () => {
      if (!ride || !driverLocation) {
        setDisplayPolyline(undefined);
        setRouteError(null);
        return;
      }

      try {
        setRouteError(null); // Clear previous errors
        if (ride.status === RideStatus.ACCEPTED || ride.status === RideStatus.PICKING_UP) {
          // Route from driver to pickup location
          const routeToPickup = await getRoute(driverLocation, ride.startLocation);
          setDisplayPolyline(routeToPickup.polyline);
        } else if (ride.status === RideStatus.IN_PROGRESS) {
          // Route from driver (now at pickup) to destination
          const routeToDestination = await getRoute(driverLocation, ride.endLocation);
          setDisplayPolyline(routeToDestination.polyline);
        } else {
          setDisplayPolyline(undefined);
        }
      } catch(error) {
        console.error("Driver route calculation failed:", error);
        setDisplayPolyline(undefined);
        if (error instanceof Error) {
            setRouteError(`فشل حساب المسار: ${error.message}`);
          } else {
            setRouteError("فشل حساب المسار لسبب غير معروف.");
          }
      }
    };

    calculateAndSetRoute();
  }, [ride?.status, driverLocation]);

  // Effect to calculate dynamic route info for the current leg of the journey
  useEffect(() => {
    if (!ride || !driverLocation || !isOnline) {
      setCurrentLegInfo(null);
      return;
    }

    // Only calculate for active trip stages
    if (
      ride.status !== RideStatus.ACCEPTED &&
      ride.status !== RideStatus.PICKING_UP &&
      ride.status !== RideStatus.IN_PROGRESS
    ) {
      setCurrentLegInfo(null);
      return;
    }

    const calculateLegRoute = async () => {
      try {
        const legDestination =
          ride.status === RideStatus.IN_PROGRESS
            ? ride.endLocation
            : ride.startLocation;

        const route = await getRoute(driverLocation, legDestination);
        setCurrentLegInfo(route);
        // We can clear the main route error if this sub-calculation succeeds
        if(routeError) setRouteError(null);
      } catch (error) {
        setCurrentLegInfo(null);
        console.error("Failed to calculate live leg route:", error);
        // Don't set a visible error for this, it's just for stats and can fail silently
      }
    };

    const debounceTimeout = setTimeout(calculateLegRoute, 2000); // Debounce to avoid excessive API calls

    return () => clearTimeout(debounceTimeout);
    
  }, [ride?.status, driverLocation, isOnline]);


  // Effect to handle trip completion feedback
  useEffect(() => {
    if (ride?.status === RideStatus.COMPLETED) {
        setLastCompletedRide(ride);
    }
    if (!ride && lastCompletedRide) {
        const timer = setTimeout(() => {
            setLastCompletedRide(null);
        }, 4000); 
        return () => clearTimeout(timer);
    }
  }, [ride, lastCompletedRide]);

  const handleAcceptRide = () => {
      acceptRide(driver);
  };

  const handleConfirmEndTrip = () => {
    completeRide();
    setShowEndTripConfirmation(false);
  };

  const handleManualLocate = () => {
    setIsManualLocating(true);
    setLocationError(null);

    const handleError = (error: GeolocationPositionError) => {
        let message = "";
        switch (error.code) {
            case error.PERMISSION_DENIED:
                message = "تم رفض إذن الوصول إلى الموقع. يرجى تفعيله من الإعدادات.";
                setIsOnline(false); // If they manually try and fail due to permissions, they should go offline.
                break;
            case error.POSITION_UNAVAILABLE:
                message = "تعذر تحديد موقعك. يرجى التأكد من أن إشارة GPS قوية.";
                break;
            case error.TIMEOUT:
                message = "انتهت مهلة طلب تحديد الموقع. يرجى المحاولة مرة أخرى.";
                break;
            default:
                message = "حدث خطأ غير متوقع أثناء محاولة تحديد موقعك.";
                break;
        }
        setLocationError(message);
        setIsManualLocating(false);
    };

    if (!navigator.geolocation) {
        setLocationError("خدمات الموقع الجغرافي غير مدعومة في متصفحك.");
        setIsManualLocating(false);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        position => {
            const { latitude, longitude } = position.coords;
            if (isLocationInSyria(latitude, longitude)) {
                setLocationError(null);
                const newLocation = { lat: latitude, lng: longitude };
                setDriverLocation(newLocation);
                updateDriverLocation(newLocation);
            } else {
                 setLocationError("تم تحديد موقع خارج النطاق الجغرافي للخدمة.");
                 console.warn(`Manual locate returned coordinates outside Syria: ${latitude}, ${longitude}`);
            }
            setIsManualLocating(false);
        },
        handleError,
        {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0,
        }
    );
  };

  const TripSummary: React.FC<{ ride: Ride }> = ({ ride }) => {
    if (ride.finalFare === undefined) return null;
    const driverShare = Math.round(ride.finalFare * 0.80);
    return (
        <div className="absolute top-20 right-4 left-4 bg-green-800/95 backdrop-blur-sm p-4 rounded-lg shadow-lg z-20 text-center animate-fade-in-down">
            <h3 className="text-xl font-bold text-white mb-2">اكتملت الرحلة بنجاح!</h3>
            <div className="space-y-1">
                <p>الأجرة الإجمالية: {ride.finalFare.toLocaleString('ar-SY', {style: 'currency', currency: 'SYP'})}</p>
                <p className="text-lg font-bold mt-2">أرباحك من الرحلة: {driverShare.toLocaleString('ar-SY', {style: 'currency', currency: 'SYP'})}</p>
            </div>
        </div>
    );
  };

  const IncomingRequest: React.FC = () => {
      if(!ride || ride.status !== RideStatus.REQUESTED || !isOnline) return null;

      const driverShare = Math.round(ride.estimatedFare * 0.80); // Assume 80% share
      const vehicleName = VEHICLE_TYPES.find(v => v.id === ride.vehicleType)?.ar || 'غير محدد';

      return (
          <div className="absolute top-20 right-4 left-4 bg-slate-800/95 backdrop-blur-sm border-2 border-secondary-DEFAULT p-4 rounded-lg shadow-lg z-20 text-center animate-fade-in-down">
              <h3 className="text-xl font-bold text-secondary-light mb-2">طلب رحلة جديد!</h3>
              
              {pickupRouteInfo ? (
                <div className="my-2 p-2 bg-slate-700/50 rounded-md">
                    <p className="font-bold text-teal-300">أنت على بعد {pickupRouteInfo.distance} كم من نقطة الالتقاط.</p>
                    <p className="text-sm text-slate-300">الوقت المقدر للوصول: {Math.round(pickupRouteInfo.duration)} دقيقة.</p>
                </div>
              ) : (
                <p className="my-2 text-slate-400 animate-pulse">...جاري حساب المسافة إلى الزبون</p>
              )}
              
              <p>من: {ride.startLocation.name}</p>
              <p>إلى: {ride.endLocation.name}</p>
              <p className="mt-2 text-sm">نوع المركبة: {vehicleName}</p>
              <p className="mt-1">مسافة الرحلة: {ride.distance} كم - الزمن التقريبي: {Math.round(ride.duration)} دقيقة</p>

               {pickupRouteInfo && (
                  <div className="mt-3 border-t border-slate-600 pt-3">
                      <h4 className="font-semibold text-base">ملخص الرحلة الكاملة (من موقعك الحالي)</h4>
                      <div className="flex justify-around text-sm mt-1">
                          <p>المسافة الإجمالية: <span className="font-bold text-lg">{(pickupRouteInfo.distance + ride.distance).toFixed(1)} كم</span></p>
                          <p>الوقت الإجمالي: <span className="font-bold text-lg">~{Math.round(pickupRouteInfo.duration + ride.duration)} دقيقة</span></p>
                      </div>
                  </div>
              )}

              <p className="text-lg font-bold mt-2">أرباحك المتوقعة: {driverShare.toLocaleString('ar-SY', {style: 'currency', currency: 'SYP'})}</p>
              <div className="flex justify-around mt-4">
                  <button onClick={handleAcceptRide} className="px-8 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transform hover:scale-105">قبول</button>
                  <button className="px-8 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transform hover:scale-105">رفض</button>
              </div>
          </div>
      );
  }
  
  const CurrentTripInfo: React.FC = () => {
    if(!ride || [RideStatus.REQUESTED, RideStatus.IDLE, RideStatus.COMPLETED, RideStatus.CANCELLED].includes(ride.status)) return null;

    if (ride.status === RideStatus.IN_PROGRESS) {
        return (
            <div className="absolute bottom-0 right-0 left-0 bg-slate-800/95 backdrop-blur-sm p-4 shadow-lg z-10 text-center rounded-t-2xl">
                <h3 className="text-lg font-bold">الرحلة جارية إلى: {ride.endLocation.name}</h3>
                <p className="text-slate-300 mt-1">الزبون: علي الزبون - 0912345678</p>
                {routeError && <p className="text-red-400 mt-2">{routeError}</p>}
                <button 
                    onClick={() => setShowEndTripConfirmation(true)} 
                    className="mt-4 w-full max-w-xs mx-auto py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark">
                    إنهاء الرحلة
                </button>
            </div>
        );
    }
    
    let statusText = '';
    let actionButton = null;
    
    switch(ride.status) {
        case RideStatus.ACCEPTED:
            statusText = 'في الطريق إلى الزبون';
            actionButton = <button onClick={() => updateRideStatus(RideStatus.PICKING_UP)} className="mt-4 px-8 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">لقد وصلت لموقع الالتقاط</button>;
            break;
        case RideStatus.PICKING_UP:
            statusText = 'في انتظار ركوب الزبون';
            actionButton = <button onClick={() => updateRideStatus(RideStatus.IN_PROGRESS)} className="mt-4 px-8 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">التقاط الزبون وبدء الرحلة</button>;
            break;
    }

    return (
       <div className="absolute bottom-0 right-0 left-0 bg-slate-800/95 backdrop-blur-sm p-4 shadow-lg z-10 text-center rounded-t-2xl">
          <h3 className="text-lg font-bold">{statusText}</h3>

          {currentLegInfo ? (
              <div className="my-3 p-2 bg-slate-700/50 rounded-md text-center">
                  <p>
                      المتبقي للوصول للزبون: 
                      <span className="font-bold text-lg mx-2">{currentLegInfo.distance.toFixed(1)} كم</span> 
                      (<span className="font-bold text-lg">~{Math.round(currentLegInfo.duration)} د</span>)
                  </p>
              </div>
          ) : (
              <div className="my-3 p-2 text-center text-slate-400 animate-pulse">
                  ...جاري حساب المسافة المتبقية
              </div>
          )}

          <div className="text-slate-300 mt-2">
            <p>الزبون: علي الزبون - رقم الهاتف: 0912345678</p>
            <p>من: {ride.startLocation.name}</p>
          </div>
          {routeError && <p className="text-red-400 mt-2">{routeError}</p>}
          {actionButton}
      </div>
    );
  }

  const ConfirmationDialog: React.FC<{ message: string; onConfirm: () => void; onCancel: () => void; }> = ({ message, onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 transition-opacity duration-300" style={{ animation: 'fadeIn 0.2s ease-out' }} onClick={onCancel}>
        <div className="bg-slate-800 rounded-lg shadow-2xl p-8 w-full max-w-sm mx-4 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-xl mb-6">{message}</p>
            <div className="flex justify-center gap-4">
                <button 
                    onClick={onConfirm} 
                    className="px-8 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transform hover:scale-105"
                >
                    نعم
                </button>
                <button 
                    onClick={onCancel} 
                    className="px-8 py-2 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-500 transform hover:scale-105"
                >
                    لا
                </button>
            </div>
        </div>
    </div>
  );

  const userProvince = driver?.province || SyrianProvinces.DAMASCUS;
  const provinceCenter = PROVINCE_COORDS[userProvince] || DAMASCUS_COORDS;

  return (
    <div className="h-screen w-screen flex flex-col relative">
      <header className="absolute top-0 left-0 right-0 bg-gradient-to-b from-slate-900/80 to-transparent p-4 flex justify-between items-center z-20">
        <h1 className="text-2xl font-bold text-primary">واجهة السائق</h1>
        <div className="flex items-center">
            <button
                onClick={handleManualLocate}
                disabled={isManualLocating}
                className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-2xl hover:bg-slate-600 disabled:opacity-50 disabled:cursor-wait mr-4"
                aria-label="تحديد موقعي الحالي"
                title="تحديد موقعي الحالي"
            >
                {isManualLocating ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  '🎯'
                )}
            </button>
            <label className="relative inline-flex items-center cursor-pointer mr-5">
                <input type="checkbox" checked={isOnline} onChange={() => setIsOnline(!isOnline)} className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                <span className="mr-3 text-sm font-medium">{isOnline ? 'متصل' : 'غير متصل'}</span>
            </label>
            <span className="ml-4">مرحباً، {user?.name}</span>
            <button onClick={logout} className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700">خروج</button>
        </div>
      </header>
      
      {showEndTripConfirmation && (
        <ConfirmationDialog
            message="هل أنت متأكد أنك تريد إنهاء الرحلة؟"
            onConfirm={handleConfirmEndTrip}
            onCancel={() => setShowEndTripConfirmation(false)}
        />
      )}

      {locationError && (
        <div className="absolute top-20 right-4 left-4 bg-red-800/95 backdrop-blur-sm p-4 rounded-lg shadow-lg z-20 text-center animate-fade-in-down">
            <p className="font-bold">خطأ في تحديد الموقع</p>
            <p>{locationError}</p>
        </div>
      )}

      {ride?.status === RideStatus.IN_PROGRESS && liveTripData ? (
          <div className="absolute inset-x-0 top-0 z-10 pt-20">
              <LiveTripDisplay {...liveTripData} />
          </div>
      ) : lastCompletedRide ? (
          <TripSummary ride={lastCompletedRide} />
      ) : (
          <IncomingRequest />
      )}
      <CurrentTripInfo />

      <div className="flex-grow">
        {driverLocation ? (
          <InteractiveMap 
              center={driverLocation ? [driverLocation.lat, driverLocation.lng] : provinceCenter}
              userLocation={driverLocation}
              startLocation={ride && ride.status !== RideStatus.IDLE && ride.status !== RideStatus.REQUESTED ? ride.startLocation : undefined}
              endLocation={ride && ride.status !== RideStatus.IDLE && ride.status !== RideStatus.REQUESTED ? ride.endLocation : undefined}
              routePolyline={displayPolyline}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-slate-900">
            <p className="text-lg animate-pulse">جاري تحديد موقعك...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverPage;