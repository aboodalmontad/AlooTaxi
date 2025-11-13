import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRide } from '../contexts/RideContext';
import InteractiveMap, { RouteStyle } from '../components/InteractiveMap';
import { DAMASCUS_COORDS, VEHICLE_TYPES, PROVINCE_COORDS, SYRIAN_PROVINCES } from '../constants';
import { RideStatus, Driver, RouteInfo, Ride, SyrianProvinces } from '../types';
import { getRoute, getHaversineDistance } from '../services/mapService';
import LiveTripDisplay from '../components/LiveTripDisplay';
import { useDriverTracking } from '../hooks/useDriverTracking';
import NavigationUI from '../components/NavigationUI';

type MapViewMode = 'free' | 'locked' | 'navigation';

const DriverPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { 
    currentRide, 
    availableRides, 
    acceptRide, 
    rejectRide, 
    completeRide, 
    updateRideStatus, 
    updateDriverLocation, 
    updateDriverOnlineStatus,
    liveTripData 
  } = useRide();

  const [isOnline, setIsOnline] = useState(true);
  const [routeLegs, setRouteLegs] = useState<RouteStyle[]>([]);
  const [driverLocation, setDriverLocation] = useState<{ lat: number, lng: number, heading: number | null } | null>(null);
  const [pickupRouteInfo, setPickupRouteInfo] = useState<RouteInfo | null>(null);
  const [currentLegInfo, setCurrentLegInfo] = useState<RouteInfo | null>(null);
  const [navigationRoute, setNavigationRoute] = useState<RouteInfo | null>(null);


  const [lastCompletedRide, setLastCompletedRide] = useState<Ride | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationWarning, setLocationWarning] = useState<string | null>(null);
  const [showEndTripConfirmation, setShowEndTripConfirmation] = useState(false);
  const [isManualLocating, setIsManualLocating] = useState(false);
  const [viewingRideRequest, setViewingRideRequest] = useState<Ride | null>(null);
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>('locked');
  const routeCalculationTimeoutRef = useRef<number | null>(null);
  const notifiedRideIdRef = useRef<string | null>(null);
  
  const driver = user as Driver;

  // Sync isOnline state with the central context
  useEffect(() => {
    if (driver) {
      updateDriverOnlineStatus(driver.id, isOnline);
    }
  }, [isOnline, driver, updateDriverOnlineStatus]);
  
  const locateDriver = useCallback((isManualRequest: boolean) => {
    if (isManualRequest) {
        setIsManualLocating(true);
    }
    setDriverLocation(null);
    setLocationError(null);
    setLocationWarning(null);

    const province = driver?.province || SyrianProvinces.DAMASCUS;
    const provinceCoords = PROVINCE_COORDS[province] || DAMASCUS_COORDS;
    const fallbackLocation = { lat: provinceCoords[0], lng: provinceCoords[1], heading: null };

    if (!navigator.geolocation) {
        setDriverLocation(fallbackLocation);
        if (driver) updateDriverLocation(driver.id, fallbackLocation);
        setLocationError("خدمات الموقع غير مدعومة. لا يمكنك العمل كسائق.");
        if (isManualRequest) setIsManualLocating(false);
        setIsOnline(false);
        return;
    }

    const setFinalLocation = (position: GeolocationPosition) => {
        const { latitude, longitude, heading } = position.coords;
        const newLocation = { lat: latitude, lng: longitude, heading };
        setDriverLocation(newLocation);
        if (driver) updateDriverLocation(driver.id, newLocation);
        setLocationError(null);
        setLocationWarning(null);
        if (isManualRequest) setIsManualLocating(false);
    };

    const finalErrorHandler = (error: GeolocationPositionError) => {
        let message = "";
        let forceOffline = false;
        switch (error.code) {
            case error.PERMISSION_DENIED:
                message = "تم رفض إذن الوصول إلى الموقع. يجب تفعيله للعمل كسائق.";
                forceOffline = true;
                break;
            case error.POSITION_UNAVAILABLE: message = "تعذر تحديد موقعك. سيتم استخدام موقع افتراضي."; break;
            case error.TIMEOUT: message = "انتهت مهلة طلب تحديد الموقع."; break;
            default: message = "حدث خطأ غير متوقع."; break;
        }
        
        setDriverLocation(fallbackLocation);
        if (driver) updateDriverLocation(driver.id, fallbackLocation);
        setLocationError(message);
        if (isManualRequest) setIsManualLocating(false);
        if (forceOffline) setIsOnline(false);
    };

    // Step 1: Try for a quick, network-based location
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude, heading } = position.coords;
            const quickLocation = { lat: latitude, lng: longitude, heading };
            setDriverLocation(quickLocation);
            if (driver) updateDriverLocation(driver.id, quickLocation);
            setLocationWarning("جاري تحسين دقة الموقع...");

            // Step 2: Now try for a high-accuracy position in the background.
            navigator.geolocation.getCurrentPosition(
                (highAccuracyPosition) => {
                    setFinalLocation(highAccuracyPosition);
                },
                (highAccuracyError) => {
                    console.warn("High-accuracy failed, using initial position.", highAccuracyError);
                    setLocationWarning("تعذر الحصول على موقع عالي الدقة. التتبع المستمر سيحاول مجدداً.");
                    if (isManualRequest) setIsManualLocating(false);
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        },
        (lowAccuracyError) => {
            // The quick attempt failed, try a single, more patient high-accuracy attempt.
            console.warn("Low-accuracy failed, trying high-accuracy directly.", lowAccuracyError);
            navigator.geolocation.getCurrentPosition(
                setFinalLocation,
                finalErrorHandler,
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
            );
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
              locateDriver(false);
          }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isOnline, locateDriver]);
  
  const handleManualLocate = () => {
    locateDriver(true);
    setMapViewMode('locked');
  };

  const handleLocationUpdate = useCallback((position: GeolocationPosition) => {
      const { latitude, longitude, heading } = position.coords;
      const newLocation = { lat: latitude, lng: longitude, heading };
      setDriverLocation(newLocation);
      if (driver) updateDriverLocation(driver.id, newLocation);
      setLocationError(null);
      setLocationWarning(null);
  }, [driver, updateDriverLocation]);

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

  useDriverTracking(isOnline && !!driver, {
    onSuccess: handleLocationUpdate,
    onError: handleLocationError,
  });

  useEffect(() => {
    if (viewingRideRequest && driverLocation && isOnline) {
      const calculatePickupRoute = async () => {
        try {
          const route = await getRoute(driverLocation, viewingRideRequest.startLocation);
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
  }, [viewingRideRequest, driverLocation, isOnline]);
  
  useEffect(() => {
    if (isOnline && !currentRide && availableRides.length > 0) {
        const unseenRide = availableRides.find(r => r.id !== notifiedRideIdRef.current);
        if(unseenRide) {
            setViewingRideRequest(unseenRide);
        }
    } else if (!isOnline || currentRide) {
        setViewingRideRequest(null);
    }
  }, [isOnline, availableRides, currentRide]);

  // Effect to calculate and display route for active trip stages
  useEffect(() => {
    const calculateAndSetRoutes = async () => {
        if (!currentRide || !driverLocation) {
            setRouteLegs([]);
            setRouteError(null);
            return;
        }

        try {
            setRouteError(null);
            const newRouteLegs: RouteStyle[] = [];

            if (currentRide.status === RideStatus.PICKING_UP) {
                const pickupRoute = await getRoute(driverLocation, currentRide.startLocation);
                newRouteLegs.push({ polyline: pickupRoute.polyline, color: '#3b82f6', casingColor: '#022c7a' });
                if (currentRide.polyline) {
                    newRouteLegs.push({ polyline: currentRide.polyline, color: '#8b5cf6', casingColor: '#4c1d95', opacity: 0.75 });
                }
            } else if (currentRide.status === RideStatus.IN_PROGRESS) {
                const dropoffRoute = await getRoute(driverLocation, currentRide.endLocation);
                newRouteLegs.push({ polyline: dropoffRoute.polyline, color: '#3b82f6', casingColor: '#022c7a' });
            } else {
                setRouteLegs([]);
                return;
            }
            setRouteLegs(newRouteLegs);
        } catch (error) {
            console.error("Driver route calculation failed:", error);
            setRouteLegs([]);
            setRouteError(error instanceof Error ? `فشل حساب المسار: ${error.message}` : "فشل حساب المسار.");
        }
    };
    if (routeCalculationTimeoutRef.current) clearTimeout(routeCalculationTimeoutRef.current);
    routeCalculationTimeoutRef.current = window.setTimeout(calculateAndSetRoutes, 1500);
    return () => { if (routeCalculationTimeoutRef.current) clearTimeout(routeCalculationTimeoutRef.current); };
  }, [currentRide?.status, driverLocation, currentRide?.startLocation, currentRide?.endLocation, currentRide?.polyline]);

  useEffect(() => {
    if (!currentRide || !driverLocation || !isOnline) {
      setCurrentLegInfo(null);
      setNavigationRoute(null);
      return;
    }

    if (currentRide.status !== RideStatus.PICKING_UP && currentRide.status !== RideStatus.IN_PROGRESS) {
      setCurrentLegInfo(null);
      setNavigationRoute(null);
      return;
    }

    const calculateLegRoute = async () => {
      try {
        const legDestination = currentRide.status === RideStatus.IN_PROGRESS ? currentRide.endLocation : currentRide.startLocation;
        const distance = getHaversineDistance(driverLocation, legDestination);
        if (distance > 200) {
            setCurrentLegInfo(null); setNavigationRoute(null); return;
        }
        const route = await getRoute(driverLocation, legDestination);
        setCurrentLegInfo(route);
        setNavigationRoute(route);
        if(routeError) setRouteError(null);
      } catch (error) {
        setCurrentLegInfo(null); setNavigationRoute(null);
        console.error("Failed to calculate live leg route:", error);
      }
    };
    const debounceTimeout = setTimeout(calculateLegRoute, 2000);
    return () => clearTimeout(debounceTimeout);
  }, [currentRide?.status, driverLocation, isOnline, currentRide?.startLocation, currentRide?.endLocation, routeError]);

  useEffect(() => {
    if (viewingRideRequest && viewingRideRequest.id !== notifiedRideIdRef.current) {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.8);
        oscillator.stop(audioContext.currentTime + 0.8);
      } catch (error) { console.error("Could not play sound:", error); }
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
      notifiedRideIdRef.current = viewingRideRequest.id;
    }
  }, [viewingRideRequest]);

  useEffect(() => {
    if (currentRide?.status === RideStatus.COMPLETED) setLastCompletedRide(currentRide);
    if (!currentRide && lastCompletedRide) {
        const timer = setTimeout(() => setLastCompletedRide(null), 4000); 
        return () => clearTimeout(timer);
    }
  }, [currentRide, lastCompletedRide]);

  const handleAcceptRide = () => {
      if (viewingRideRequest && driver) {
        acceptRide(viewingRideRequest.id, driver);
        setViewingRideRequest(null);
      }
  };

  const handleRejectRide = () => {
    if (viewingRideRequest) {
        rejectRide(viewingRideRequest.id);
        setViewingRideRequest(null);
    }
  };

  const handleConfirmEndTrip = () => {
    if (currentRide) completeRide(currentRide.id);
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

  const IncomingRequest: React.FC<{ ride: Ride }> = ({ ride }) => {
      const driverShare = Math.round(ride.estimatedFare * 0.80);
      const vehicleName = VEHICLE_TYPES.find(v => v.id === ride.vehicleType)?.ar || 'غير محدد';

      return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 transition-opacity duration-300 animate-fade-in">
              <div className="bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 border-2 border-primary-dark transform animate-fade-in-up">
                  <h3 className="text-3xl font-bold text-primary text-center mb-4">طلب رحلة جديد!</h3>
                  
                  {pickupRouteInfo ? (
                    <div className="my-3 p-3 bg-slate-700/50 rounded-lg text-center">
                        <p className="font-bold text-xl text-teal-300">{pickupRouteInfo.distance} كم منك</p>
                        <p className="text-slate-300">~{Math.round(pickupRouteInfo.duration)} دقيقة للوصول للزبون</p>
                    </div>
                  ) : (
                    <p className="my-3 text-center text-slate-400 animate-pulse">...جاري حساب المسافة إلى الزبون</p>
                  )}
                  
                  <div className="space-y-2 text-right text-lg my-4">
                    <p><span className="font-semibold text-slate-400">من:</span> {ride.startLocation.name}</p>
                    <p><span className="font-semibold text-slate-400">إلى:</span> {ride.endLocation.name}</p>
                  </div>

                  <div className="flex justify-between items-center bg-slate-700/50 p-3 rounded-lg text-center">
                      <div><p className="text-sm text-slate-400">مسافة الرحلة</p><p className="font-bold text-xl">{ride.distance} كم</p></div>
                      <div><p className="text-sm text-slate-400">نوع المركبة</p><p className="font-bold text-xl">{vehicleName}</p></div>
                      <div><p className="text-sm text-slate-400">زمن الرحلة</p><p className="font-bold text-xl">~{Math.round(ride.duration)} د</p></div>
                  </div>

                  <div className="mt-4 text-center">
                    <p className="text-slate-300">أرباحك المتوقعة</p>
                    <p className="text-3xl font-bold text-green-400 my-1">{driverShare.toLocaleString('ar-SY', {style: 'currency', currency: 'SYP'})}</p>
                  </div>

                  <div className="flex justify-around mt-6 gap-4">
                      <button onClick={handleAcceptRide} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transform hover:scale-105 text-xl">قبول</button>
                      <button onClick={handleRejectRide} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transform hover:scale-105 text-xl">رفض</button>
                  </div>
              </div>
          </div>
      );
  }
  
  const CurrentTripInfo: React.FC = () => {
    if(!currentRide) return null;

    if (currentRide.status === RideStatus.IN_PROGRESS) {
        return (
            <div className="absolute bottom-0 right-0 left-0 bg-slate-800/95 backdrop-blur-sm p-4 shadow-lg z-10 text-center rounded-t-2xl">
                <h3 className="text-lg font-bold">الرحلة جارية إلى: {currentRide.endLocation.name}</h3>
                <p className="text-slate-300 mt-1">الزبون: علي الزبون - 0912345678</p>
                {routeError && <p className="text-red-400 mt-2">{routeError}</p>}
                <button onClick={() => setShowEndTripConfirmation(true)} className="mt-4 w-full max-w-xs mx-auto py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark">إنهاء الرحلة</button>
            </div>
        );
    }
    
    let statusText = '', actionButton = null;
    
    if(currentRide.status === RideStatus.PICKING_UP) {
        statusText = 'في الطريق إلى الزبون';
        actionButton = <button onClick={() => updateRideStatus(currentRide.id, RideStatus.IN_PROGRESS)} className="mt-4 px-8 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">التقاط الزبون وبدء الرحلة</button>;
    }

    return (
       <div className="absolute bottom-0 right-0 left-0 bg-slate-800/95 backdrop-blur-sm p-4 shadow-lg z-10 text-center rounded-t-2xl">
          <h3 className="text-lg font-bold">{statusText}</h3>
          {currentLegInfo ? (
              <div className="my-3 p-2 bg-slate-700/50 rounded-md text-center">
                  <p>المتبقي للوصول: <span className="font-bold text-lg mx-2">{currentLegInfo.distance.toFixed(1)} كم</span> (<span className="font-bold text-lg">~{Math.round(currentLegInfo.duration)} د</span>)</p>
              </div>
          ) : (<div className="my-3 p-2 text-center text-slate-400 animate-pulse">...جاري حساب المسافة</div>)}
          <div className="text-slate-300 mt-2">
            <p>الزبون: علي الزبون - هاتف: 0912345678</p>
            <p>من: {currentRide.startLocation.name}</p>
          </div>
          {routeError && <p className="text-red-400 mt-2">{routeError}</p>}
          {actionButton}
      </div>
    );
  }

  const ConfirmationDialog: React.FC<{ message: string; onConfirm: () => void; onCancel: () => void; }> = ({ message, onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" style={{ animation: 'fadeIn 0.2s ease-out' }} onClick={onCancel}>
        <div className="bg-slate-800 rounded-lg shadow-2xl p-8 w-full max-w-sm mx-4 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-xl mb-6">{message}</p>
            <div className="flex justify-center gap-4">
                <button onClick={onConfirm} className="px-8 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark">نعم</button>
                <button onClick={onCancel} className="px-8 py-2 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-500">لا</button>
            </div>
        </div>
    </div>
  );

  const userProvince = driver?.province || SyrianProvinces.DAMASCUS;
  const provinceCenter = PROVINCE_COORDS[userProvince] || DAMASCUS_COORDS;
  const canNavigate = mapViewMode === 'navigation' && typeof driverLocation?.heading === 'number';
  
  const routeLegsForMap = useMemo(() => {
    if (canNavigate && navigationRoute) {
        return [{ polyline: navigationRoute.polyline, color: '#34D399', casingColor: '#047857', weight: 10 }];
    }
    return routeLegs;
  }, [canNavigate, navigationRoute, routeLegs]);

  return (
    <div className="h-screen w-screen flex flex-col relative">
      <header className="absolute top-0 left-0 right-0 bg-gradient-to-b from-slate-900/80 to-transparent p-4 flex justify-between items-center z-20">
        <h1 className="text-2xl font-bold text-primary">واجهة السائق</h1>
        <div className="flex items-center">
            <button onClick={handleManualLocate} disabled={isManualLocating} className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-2xl hover:bg-slate-600 disabled:opacity-50 mr-4" title="تحديد موقعي">
                {isManualLocating ? (<svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>) : '🎯'}
            </button>
            <label className="relative inline-flex items-center cursor-pointer mr-5">
                <input type="checkbox" checked={isOnline} onChange={() => setIsOnline(!isOnline)} className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                <span className="mr-3 text-sm font-medium">{isOnline ? 'متصل' : 'غير متصل'}</span>
            </label>
            <span className="ml-4">مرحباً، {user?.name}</span>
            <button onClick={logout} className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700">خروج</button>
        </div>
      </header>
      
      {showEndTripConfirmation && (
        <ConfirmationDialog message="هل أنت متأكد أنك تريد إنهاء الرحلة؟" onConfirm={handleConfirmEndTrip} onCancel={() => setShowEndTripConfirmation(false)} />
      )}
      {locationError && <div className="absolute top-20 right-4 left-4 bg-red-800/95 p-4 rounded-lg z-20 text-center"><p className="font-bold">خطأ الموقع</p><p>{locationError}</p></div>}
      {locationWarning && !locationError && <div className="absolute top-20 right-4 left-4 bg-yellow-600/95 p-4 rounded-lg z-20 text-center"><p className="font-bold">تنبيه</p><p>{locationWarning}</p></div>}
      {canNavigate ? (<NavigationUI routeInfo={navigationRoute} currentLocation={driverLocation} />
      ) : currentRide?.status === RideStatus.IN_PROGRESS && liveTripData ? (<div className="absolute inset-x-0 top-0 z-10 pt-20"><LiveTripDisplay {...liveTripData} /></div>
      ) : lastCompletedRide ? (<TripSummary ride={lastCompletedRide} />
      ) : (viewingRideRequest && <IncomingRequest ride={viewingRideRequest} />
      )}
      {!canNavigate && <CurrentTripInfo />}

      <div className="flex-grow relative">
          <div className="absolute top-24 right-4 z-10 flex flex-col gap-2">
            {mapViewMode !== 'locked' && <button onClick={() => setMapViewMode('locked')} className="w-12 h-12 bg-slate-800/80 rounded-full flex items-center justify-center text-3xl hover:bg-slate-700" title="إعادة التمركز">🖼️</button>}
            <button onClick={() => setMapViewMode(mapViewMode === 'navigation' ? 'locked' : 'navigation')} disabled={typeof driverLocation?.heading !== 'number'} className={`w-12 h-12 rounded-full flex items-center justify-center text-3xl ${mapViewMode === 'navigation' ? 'bg-primary' : 'bg-slate-800/80 hover:bg-slate-700'} disabled:opacity-50`} title="وضع الملاحة">🧭</button>
          </div>
          {driverLocation ? (
            <InteractiveMap center={driverLocation ? [driverLocation.lat, driverLocation.lng] : provinceCenter} userLocation={driverLocation} userLocationAs="driver" startLocation={currentRide?.startLocation} endLocation={currentRide?.endLocation} routes={routeLegsForMap} disableAutoPanZoom={mapViewMode !== 'locked' || canNavigate} onUserInteraction={() => setMapViewMode('free')} navigationMode={{ enabled: canNavigate, bearing: driverLocation?.heading ?? 0 }} />
          ) : (<div className="h-full w-full flex items-center justify-center bg-slate-900"><p className="text-lg animate-pulse">جاري تحديد موقعك...</p></div>)}
      </div>
    </div>
  );
};

export default DriverPage;