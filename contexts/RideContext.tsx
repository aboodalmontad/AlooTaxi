import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect, useRef, useMemo } from 'react';
// FIX: Import UserRole to resolve type errors.
import { Ride, RideStatus, PricingSettings, RouteInfo, Driver, VehicleType, UserRole } from '../types';
import { useAuth } from './AuthContext';
import { mockUsers } from './AuthContext';

interface LiveTripData {
  distanceTraveled: number; // in km
  timeElapsed: number; // in seconds
  currentFare: number;
}

interface RideContextType {
  currentRide: Ride | null;
  availableRides: Ride[];
  allRides: Ride[];
  onlineDrivers: Driver[];
  liveTripData: LiveTripData | null;
  pricing: PricingSettings;
  requestRide: (start: any, end: any, vehicleType: VehicleType, routeInfo: RouteInfo, schedule?: { isScheduled: boolean, time: string }) => void;
  acceptRide: (rideId: string, driver: Driver) => void;
  rejectRide: (rideId: string) => void;
  cancelRide: (rideId: string) => void;
  completeRide: (rideId: string) => void;
  updatePricing: (newPricing: PricingSettings) => void;
  getEstimatedFare: (vehicleType: VehicleType, distance: number, duration: number) => number;
  updateRideStatus: (rideId: string, newStatus: RideStatus) => void;
  updateDriverLocation: (driverId: string, location: { lat: number; lng: number; heading: number | null }) => void;
  updateDriverOnlineStatus: (driverId: string, isOnline: boolean) => void;
}

const RideContext = createContext<RideContextType | undefined>(undefined);

const RIDES_DB_KEY = 'allo-taxi-rides-db';
const DRIVERS_DB_KEY = 'allo-taxi-drivers-db';

const initialPricing: PricingSettings = {
    [VehicleType.NORMAL_CAR]: { baseFare: 3000, perKm: 500, perMinute: 100 },
    [VehicleType.AC_CAR]: { baseFare: 4000, perKm: 600, perMinute: 125 },
    [VehicleType.PUBLIC_CAR]: { baseFare: 2500, perKm: 450, perMinute: 90 },
    [VehicleType.VIP]: { baseFare: 10000, perKm: 1200, perMinute: 300 },
    [VehicleType.MICROBUS]: { baseFare: 6000, perKm: 700, perMinute: 150 },
    [VehicleType.MOTORCYCLE]: { baseFare: 1500, perKm: 300, perMinute: 75 },
};

// Helper to safely interact with localStorage
const db = {
  read: <T,>(key: string): T | null => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error(`Error reading ${key} from localStorage`, error);
      return null;
    }
  },
  write: (key: string, data: any) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error(`Error writing ${key} to localStorage`, error);
    }
  },
};


export const RideProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [rides, setRides] = useState<Ride[]>(() => db.read<Ride[]>(RIDES_DB_KEY) || []);
  const [drivers, setDrivers] = useState<Driver[]>(() => db.read<Driver[]>(DRIVERS_DB_KEY) || []);
  const [pricing, setPricing] = useState<PricingSettings>(initialPricing);
  const [liveTripData, setLiveTripData] = useState<LiveTripData | null>(null);
  
  const { user } = useAuth();
  const tripIntervalRef = useRef<number | null>(null);
  const tripStartTimeRef = useRef<Date | null>(null);

  // Initialize and sync state with localStorage
  useEffect(() => {
    // Seed drivers DB from mock data if it's empty
    const storedDrivers = db.read<Driver[]>(DRIVERS_DB_KEY);
    if (!storedDrivers || storedDrivers.length === 0) {
      const initialDrivers = Object.values(mockUsers).filter(u => u.role === 'DRIVER') as Driver[];
      setDrivers(initialDrivers);
      db.write(DRIVERS_DB_KEY, initialDrivers);
    }

    const syncState = (event: StorageEvent) => {
        if (event.key === RIDES_DB_KEY) {
            setRides(db.read<Ride[]>(RIDES_DB_KEY) || []);
        }
        if (event.key === DRIVERS_DB_KEY) {
            setDrivers(db.read<Driver[]>(DRIVERS_DB_KEY) || []);
        }
    };

    window.addEventListener('storage', syncState);
    return () => window.removeEventListener('storage', syncState);
  }, []);


  const currentRide = useMemo<Ride | null>(() => {
    if (!user) return null;
    const activeStatuses = [RideStatus.REQUESTED, RideStatus.ACCEPTED, RideStatus.PICKING_UP, RideStatus.IN_PROGRESS];

    if (user.role === UserRole.CUSTOMER) {
        return rides.find(r => r.customerId === user.id && activeStatuses.includes(r.status)) || null;
    }
    if (user.role === UserRole.DRIVER) {
        return rides.find(r => r.driverId === user.id && activeStatuses.includes(r.status)) || null;
    }
    return null;
  }, [user, rides]);


  const getEstimatedFare = useCallback((vehicleType: VehicleType, distance: number, duration: number) => {
    const vehiclePricing = pricing[vehicleType];
    if (!vehiclePricing) return 0;
    const fare = vehiclePricing.baseFare + (distance * vehiclePricing.perKm) + (duration * vehiclePricing.perMinute);
    return Math.round(fare);
  }, [pricing]);


  const requestRide = useCallback((start, end, vehicleType, routeInfo, schedule) => {
    if (!user) return;
    const estimatedFare = getEstimatedFare(vehicleType, routeInfo.distance, routeInfo.duration);
    const newRide: Ride = {
      id: `ride_${Date.now()}`,
      customerId: user.id,
      startLocation: start,
      endLocation: end,
      status: RideStatus.REQUESTED,
      vehicleType,
      estimatedFare,
      distance: routeInfo.distance,
      duration: routeInfo.duration,
      polyline: routeInfo.polyline,
      createdAt: new Date().toISOString(),
      isScheduled: schedule?.isScheduled || false,
      scheduledTime: schedule?.time
    };
    
    const updatedRides = [...rides, newRide];
    setRides(updatedRides);
    db.write(RIDES_DB_KEY, updatedRides);
    setLiveTripData(null);
  }, [user, getEstimatedFare, rides]);

  const acceptRide = useCallback((rideId: string, driver: Driver) => {
    const updatedRides = rides.map(r => 
        r.id === rideId ? { ...r, status: RideStatus.PICKING_UP, driverId: driver.id } : r
    );
    setRides(updatedRides);
    db.write(RIDES_DB_KEY, updatedRides);
  }, [rides]);

  const rejectRide = useCallback((rideId: string) => {
    const updatedRides = rides.filter(r => r.id !== rideId);
    setRides(updatedRides);
    db.write(RIDES_DB_KEY, updatedRides);
  }, [rides]);
  
  const updateDriverLocation = useCallback((driverId: string, location: { lat: number; lng: number; heading: number | null}) => {
    const updatedDrivers = drivers.map(d =>
      d.id === driverId ? { ...d, location } : d
    );
    setDrivers(updatedDrivers);
    db.write(DRIVERS_DB_KEY, updatedDrivers);
  }, [drivers]);

  const updateDriverOnlineStatus = useCallback((driverId: string, isOnline: boolean) => {
    const updatedDrivers = drivers.map(d =>
      d.id === driverId ? { ...d, isOnline } : d
    );
    setDrivers(updatedDrivers);
    db.write(DRIVERS_DB_KEY, updatedDrivers);
  }, [drivers]);

  const updateRideStatus = (rideId: string, newStatus: RideStatus) => {
    const updatedRides = rides.map(r => r.id === rideId ? { ...r, status: newStatus } : r);
    setRides(updatedRides);
    db.write(RIDES_DB_KEY, updatedRides);
  };

  const cancelRide = (rideId: string) => {
    const updatedRides = rides.map(r => r.id === rideId ? { ...r, status: RideStatus.CANCELLED } : r);
    setRides(updatedRides);
    db.write(RIDES_DB_KEY, updatedRides);
    // Cleanup cancelled/completed rides after a delay to show the final status
    setTimeout(() => {
        const finalRides = (db.read<Ride[]>(RIDES_DB_KEY) || []).filter(r => r.id !== rideId);
        setRides(finalRides);
        db.write(RIDES_DB_KEY, finalRides);
    }, 5000);
  };

  const completeRide = (rideId: string) => {
    const rideToComplete = rides.find(r => r.id === rideId);
    if (!rideToComplete) return;

    const finalFare = liveTripData?.currentFare ?? getEstimatedFare(rideToComplete.vehicleType, rideToComplete.distance, rideToComplete.duration + Math.random() * 5);
    
    const updatedRides = rides.map(r => r.id === rideId ? {
        ...r,
        status: RideStatus.COMPLETED,
        finalFare,
        completedAt: new Date().toISOString()
    } : r);
    
    setRides(updatedRides);
    db.write(RIDES_DB_KEY, updatedRides);
    
    setTimeout(() => {
        const finalRides = (db.read<Ride[]>(RIDES_DB_KEY) || []).filter(r => r.id !== rideId);
        setRides(finalRides);
        db.write(RIDES_DB_KEY, finalRides);
    }, 5000);
  };
  
  // Effect to manage the live trip timer for the current user's ride
  useEffect(() => {
    if (currentRide?.status === RideStatus.IN_PROGRESS) {
      if (!tripIntervalRef.current) {
        tripStartTimeRef.current = new Date();
        setLiveTripData({
          distanceTraveled: 0,
          timeElapsed: 0,
          currentFare: pricing[currentRide.vehicleType].baseFare,
        });

        const totalDistance = currentRide.distance;
        const totalDurationInSeconds = currentRide.duration * 60;

        tripIntervalRef.current = window.setInterval(() => {
          if (!tripStartTimeRef.current || !currentRide || currentRide.status !== RideStatus.IN_PROGRESS) {
              if (tripIntervalRef.current) clearInterval(tripIntervalRef.current);
              tripIntervalRef.current = null;
              return;
          }
          
          const now = new Date();
          const timeElapsed = (now.getTime() - tripStartTimeRef.current.getTime()) / 1000;
          const progressRatio = totalDurationInSeconds > 0 ? Math.min(1, timeElapsed / totalDurationInSeconds) : 1;
          const distanceTraveled = totalDistance * progressRatio;

          const vehiclePricing = pricing[currentRide.vehicleType];
          const distanceFare = distanceTraveled * vehiclePricing.perKm;
          const timeFare = (timeElapsed / 60) * vehiclePricing.perMinute;
          const currentFare = vehiclePricing.baseFare + distanceFare + timeFare;

          setLiveTripData({
            distanceTraveled,
            timeElapsed,
            currentFare: Math.round(currentFare),
          });
        }, 1000);
      }
    } else {
      if (tripIntervalRef.current) {
        clearInterval(tripIntervalRef.current);
        tripIntervalRef.current = null;
        tripStartTimeRef.current = null;
        if (liveTripData) setLiveTripData(null);
      }
    }
    return () => {
      if (tripIntervalRef.current) clearInterval(tripIntervalRef.current);
    };
  }, [currentRide, pricing, liveTripData]);


  const updatePricing = (newPricing: PricingSettings) => {
      setPricing(newPricing);
  };
  
  const value = {
      currentRide,
      availableRides: rides.filter(r => r.status === RideStatus.REQUESTED),
      allRides: rides,
      onlineDrivers: drivers.filter(d => d.isOnline && d.location),
      liveTripData,
      pricing,
      requestRide,
      acceptRide,
      rejectRide,
      cancelRide,
      completeRide,
      updatePricing,
      getEstimatedFare,
      updateRideStatus,
      updateDriverLocation,
      updateDriverOnlineStatus,
  };

  return (
    <RideContext.Provider value={value}>
      {children}
    </RideContext.Provider>
  );
};

export const useRide = () => {
  const context = useContext(RideContext);
  if (context === undefined) {
    throw new Error('useRide must be used within a RideProvider');
  }
  return context;
};
