import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRide } from '../contexts/RideContext';
import InteractiveMap, { RouteStyle } from '../components/InteractiveMap';
import { DAMASCUS_COORDS, VEHICLE_TYPES, PROVINCE_COORDS, SYRIAN_PROVINCES } from '../constants';
import { RideStatus, Driver, RouteInfo, Ride, SyrianProvinces } from '../types';
import { getRoute, getHaversineDistance } from '../services/mapService';
import LiveTripDisplay from '../components/LiveTripDisplay';
import { useDriverTracking } from '../hooks/useDriverTracking';

const DriverPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { ride, acceptRide, rejectRide, completeRide, updateRideStatus, updateDriverLocation, liveTripData } = useRide();
  const [isOnline, setIsOnline] = useState(true);
  const [routeLegs, setRouteLegs] = useState<RouteStyle[]>([]);
  const [driverLocation, setDriverLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [pickupRouteInfo, setPickupRouteInfo] = useState<RouteInfo | null>(null);
  const [currentLegInfo, setCurrentLegInfo] = useState<RouteInfo | null>(null);

  const [lastCompletedRide, setLastCompletedRide] = useState<Ride | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationWarning, setLocationWarning] = useState<string | null>(null);
  const [showEndTripConfirmation, setShowEndTripConfirmation] = useState(false);
  const [isManualLocating, setIsManualLocating] = useState(false);
  const [isCurrentRideTooFar, setIsCurrentRideTooFar] = useState(false);
  const [isMapLocked, setIsMapLocked] = useState(true); // Lock map to follow driver by default
  const routeCalculationTimeoutRef = useRef<number | null>(null);
  
  const driver = user as Driver;
  
  const locateDriver = useCallback((isManualRequest: boolean) => {
    // Force a hard refresh by clearing the old location first.
    setDriverLocation(null);
    if (isManualRequest) {
        setIsManualLocating(true);
    }
    setLocationError(null);
    setLocationWarning(null);

    const province = driver?.province || SyrianProvinces.DAMASCUS;
    const provinceCoords = PROVINCE_COORDS[province] || DAMASCUS_COORDS;
    const provinceName = SYRIAN_PROVINCES.find(p => p.id === province)?.ar || 'دمشق';

    if (!navigator.geolocation) {
        setDriverLocation(current => current ?? { lat: provinceCoords[0], lng: provinceCoords[1] });
        updateDriverLocation({ lat: provinceCoords[0], lng: provinceCoords[1] });
        setLocationError("خدمات الموقع غير مدعومة. لا يمكنك العمل كسائق.");
        if (isManualRequest) setIsManualLocating(false);
        setIsOnline(false);
        return;
    }

    const handlePosition = (position: GeolocationPosition) => {
        const { latitude, longitude } = position.coords;
        const newLocation = { lat: latitude, lng: longitude };
        
        setDriverLocation(newLocation);
        updateDriverLocation(newLocation);
        setLocationWarning(null);
        setLocationError(null);
        if (isManualRequest) setIsManualLocating(false);
    };

    const handleError = (error: GeolocationPositionError) => {
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
                message = "إشارة GPS ضعيفة أو غير متاحة.";
                break;
            case error.TIMEOUT:
                message = "انتهت مهلة طلب تحديد الموقع.";
                break;
            default:
                message = "حدث خطأ غير متوقع.";
                break;
        }
        
        const fallbackLocation = { lat: provinceCoords[0], lng: provinceCoords[1] };
        setDriverLocation(current => current ?? fallbackLocation);
        updateDriverLocation(fallbackLocation);

        let fullMessage = `${message}`;
        if (isPermissionError) {
            fullMessage += " يرجى تفعيل إذن الموقع في إعدادات المتصفح ثم تحديث الصفحة.";
        }
        setLocationError(fullMessage);
        if (isManualRequest) setIsManualLocating(false);
        if (forceOffline) setIsOnline(false);
    };

    // Two-phase location fetching
    navigator.geolocation.getCurrentPosition(
      handlePosition,
      () => {
          navigator.geolocation.getCurrentPosition(handlePosition, handleError, {
              enableHighAccuracy: true,
              timeout: 20000,
              maximumAge: 0,
          });
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  }, [driver, updateDriverLocation]);
  
  // Effect for initial location fetch
  useEffect(() => {
    if (isOnline && !driverLocation && !isManualLocating) {
        locateDriver(false);
    }
  }, [isOnline, driverLocation, locateDriver, isManualLocating]);

  // Effect to handle stale location from VPNs by re-fetching on tab focus
  useEffect(() => {
      const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible' && isOnline) {
              // User has returned to the app, force a location refresh
              // to clear any stale data from a VPN.
              locateDriver(false);
          }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
  }, [isOnline, locateDriver]);
  
  const handleManualLocate = () => {
    locateDriver(true);
    setIsMapLocked(true); // Re-enable "follow me" mode
  };

  const handleLocationUpdate = useCallback((position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      const newLocation = {
          lat: latitude,
          lng: longitude,
      };
      setDriverLocation(newLocation);
      updateDriverLocation(newLocation);
      setLocationError(null);
      setLocationWarning(null);
  }, [updateDriverLocation]);

  const handleLocationError = useCallback((err: GeolocationPositionError) => {
      let message = "";
      switch (err.code) {
          case err.PERMISSION_DENIED:
              message = "تم رفض إذن الموقع. تم إيقاف التتبع المباشر.";
              setIsOnline(false);
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
  }, []);

  useDriverTracking(isOnline && !!driverLocation, {
    onSuccess: handleLocationUpdate,
    onError: handleLocationError,
  });

  useEffect(() => {
    setIsCurrentRideTooFar(false);
    
    if (ride?.status === RideStatus.REQUESTED && driverLocation && isOnline) {
      const distanceToPickup = getHaversineDistance(driverLocation, ride.startLocation);
      const MAX_PICKUP_DISTANCE_KM = 200;

      if (distanceToPickup > MAX_PICKUP_DISTANCE_KM) {
        console.warn(`Ride request ignored as it is too far away: ${distanceToPickup.toFixed(1)} km.`);
        setIsCurrentRideTooFar(true);
        setPickupRouteInfo(null);
        return;
      }

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
    const calculateAndSetRoutes = async () => {
        if (!ride || !driverLocation) {
            setRouteLegs([]);
            setRouteError(null);
            return;
        }

        try {
            setRouteError(null);
            const newRouteLegs: RouteStyle[] = [];

            if (ride.status === RideStatus.PICKING_UP) {
                // Leg 1: Driver to pickup (live, blue)
                const pickupRoute = await getRoute(driverLocation, ride.startLocation);
                newRouteLegs.push({
                    polyline: pickupRoute.polyline,
                    color: '#3b82f6',
                    casingColor: '#022c7a',
                });

                // Leg 2: Pickup to destination (upcoming, purple)
                if (ride.polyline) {
                    newRouteLegs.push({
                        polyline: ride.polyline,
                        color: '#8b5cf6',
                        casingColor: '#4c1d95',
                        opacity: 0.75
                    });
                }
            } else if (ride.status === RideStatus.IN_PROGRESS) {
                // Main Leg: Driver to destination (live, blue)
                const dropoffRoute = await getRoute(driverLocation, ride.endLocation);
                newRouteLegs.push({
                    polyline: dropoffRoute.polyline,
                    color: '#3b82f6',
                    casingColor: '#022c7a',
                });
            } else {
                setRouteLegs([]);
                return;
            }

            setRouteLegs(newRouteLegs);

        } catch (error) {
            console.error("Driver route calculation failed:", error);
            setRouteLegs([]);
            const errorMessage = error instanceof Error ? `فشل حساب المسار: ${error.message}` : "فشل حساب المسار لسبب غير معروف.";
            setRouteError(errorMessage);
        }
    };

    if (routeCalculationTimeoutRef.current) {
        clearTimeout(routeCalculationTimeoutRef.current);
    }
    routeCalculationTimeoutRef.current = window.setTimeout(calculateAndSetRoutes, 1500);

    return () => {
        if (routeCalculationTimeoutRef.current) {
            clearTimeout(routeCalculationTimeoutRef.current);
        }
    };
  }, [ride?.status, driverLocation, ride?.startLocation, ride?.endLocation, ride?.polyline]);

  useEffect(() => {
    if (!ride || !driverLocation || !isOnline) {
      setCurrentLegInfo(null);
      return;
    }

    if (
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
            
        const distanceToLegDestination = getHaversineDistance(driverLocation, legDestination);
        const MAX_ROUTE_DISTANCE_KM = 200;
        if (distanceToLegDestination > MAX_ROUTE_DISTANCE_KM) {
            console.warn(`Live leg info calculation aborted due to excessive distance: ${distanceToLegDestination.toFixed(1)}km.`);
            setCurrentLegInfo(null);
            return;
        }

        const route = await getRoute(driverLocation, legDestination);
        setCurrentLegInfo(route);
        if(routeError) setRouteError(null);
      } catch (error) {
        setCurrentLegInfo(null);
        console.error("Failed to calculate live leg route:", error);
      }
    };

    const debounceTimeout = setTimeout(calculateLegRoute, 2000);

    return () => clearTimeout(debounceTimeout);
    
  }, [ride?.status, driverLocation, isOnline, ride?.startLocation, ride?.endLocation, routeError]);

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
      if (ride) {
        acceptRide(driver);
      }
  };

  const handleRejectRide = () => {
    rejectRide();
  };

  const handleConfirmEndTrip = () => {
    completeRide();
    setShowEndTripConfirmation(false);
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
      if (isCurrentRideTooFar) {
          return (
              <div className="absolute top-20 right-4 left-4 bg-yellow-800/95 backdrop-blur-sm p-4 rounded-lg shadow-lg z-20 text-center animate-fade-in-down">
                  <h3 className="text-xl font-bold text-yellow-200 mb-2">تم تجاهل طلب رحلة</h3>
                  <p>الزبون بعيد جداً عن موقعك الحالي.</p>
              </div>
          );
      }
      
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
                  <button onClick={handleRejectRide} className="px-8 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transform hover:scale-105">رفض</button>
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
        case RideStatus.PICKING_UP:
            statusText = 'في الطريق إلى الزبون';
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

      {locationWarning && !locationError && (
        <div className="absolute top-20 right-4 left-4 bg-yellow-600/95 backdrop-blur-sm p-4 rounded-lg shadow-lg z-20 text-center animate-fade-in-down">
            <p className="font-bold">تنبيه بشأن الموقع</p>
            <p>{locationWarning}</p>
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
              routes={routeLegs}
              disableAutoPanZoom={!isMapLocked}
              onUserInteraction={() => setIsMapLocked(false)}
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