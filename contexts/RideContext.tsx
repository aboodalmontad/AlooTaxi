import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect, useRef } from 'react';
import { Ride, RideStatus, PricingSettings, RouteInfo, Driver, VehicleType, VehiclePricing } from '../types';
import { useAuth } from './AuthContext';

interface LiveTripData {
  distanceTraveled: number; // in km
  timeElapsed: number; // in seconds
  currentFare: number;
}

interface RideContextType {
  ride: Ride | null;
  driverLiveLocation: { lat: number; lng: number; } | null;
  liveTripData: LiveTripData | null;
  pricing: PricingSettings;
  requestRide: (start: any, end: any, vehicleType: VehicleType, routeInfo: RouteInfo, schedule?: { isScheduled: boolean, time: string }) => void;
  acceptRide: (driver: Driver) => void;
  rejectRide: () => void;
  cancelRide: () => void;
  completeRide: () => void;
  updatePricing: (newPricing: PricingSettings) => void;
  getEstimatedFare: (vehicleType: VehicleType, distance: number, duration: number) => number;
  updateRideStatus: (newStatus: RideStatus) => void;
  updateDriverLocation: (location: { lat: number; lng: number; }) => void;
}

const RideContext = createContext<RideContextType | undefined>(undefined);

const initialPricing: PricingSettings = {
    [VehicleType.NORMAL_CAR]: { baseFare: 3000, perKm: 500, perMinute: 100 },
    [VehicleType.AC_CAR]: { baseFare: 4000, perKm: 600, perMinute: 125 },
    [VehicleType.PUBLIC_CAR]: { baseFare: 2500, perKm: 450, perMinute: 90 },
    [VehicleType.VIP]: { baseFare: 10000, perKm: 1200, perMinute: 300 },
    [VehicleType.MICROBUS]: { baseFare: 6000, perKm: 700, perMinute: 150 },
    [VehicleType.MOTORCYCLE]: { baseFare: 1500, perKm: 300, perMinute: 75 },
};

export const RideProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [ride, setRide] = useState<Ride | null>(null);
  const [driverLiveLocation, setDriverLiveLocation] = useState<{ lat: number; lng: number; } | null>(null);
  const [pricing, setPricing] = useState<PricingSettings>(initialPricing);
  const { user } = useAuth();
  const [liveTripData, setLiveTripData] = useState<LiveTripData | null>(null);

  const tripIntervalRef = useRef<number | null>(null);
  const tripStartTimeRef = useRef<Date | null>(null);

  const getEstimatedFare = useCallback((vehicleType: VehicleType, distance: number, duration: number) => {
    const vehiclePricing = pricing[vehicleType];
    if (!vehiclePricing) return 0;

    const fare = vehiclePricing.baseFare + (distance * vehiclePricing.perKm) + (duration * vehiclePricing.perMinute);
    return Math.round(fare);
  }, [pricing]);


  const requestRide = useCallback((
        start: { lat: number; lng: number; name: string }, 
        end: { lat: number; lng: number; name: string },
        vehicleType: VehicleType,
        routeInfo: RouteInfo,
        schedule?: { isScheduled: boolean, time: string }
    ) => {
    if (!user) return;
    
    const estimatedFare = getEstimatedFare(vehicleType, routeInfo.distance, routeInfo.duration);

    const newRide: Ride = {
      id: `ride_${Date.now()}`,
      customerId: user.id,
      startLocation: start,
      endLocation: end,
      status: RideStatus.REQUESTED,
      vehicleType: vehicleType,
      estimatedFare: estimatedFare,
      distance: routeInfo.distance,
      duration: routeInfo.duration,
      polyline: routeInfo.polyline,
      createdAt: new Date().toISOString(),
      isScheduled: schedule?.isScheduled || false,
      scheduledTime: schedule?.time
    };
    setRide(newRide);
    setLiveTripData(null); // Clear any previous live data
  }, [user, getEstimatedFare]);

  const acceptRide = (driver: Driver) => {
    if (ride && ride.status === RideStatus.REQUESTED) {
      setRide({ ...ride, status: RideStatus.ACCEPTED, driverId: driver.id });
    }
  };

  const rejectRide = () => {
    // For the mock, this simply dismisses the ride for the driver.
    // In a real system, it would go back to a queue.
    if (ride && ride.status === RideStatus.REQUESTED) {
      setRide(null);
    }
  };
  
  const updateDriverLocation = useCallback((location: { lat: number; lng: number }) => {
    setDriverLiveLocation(location);
  }, []);

  const updateRideStatus = (newStatus: RideStatus) => {
    setRide(prev => {
        if (!prev) return null;
        if (prev.status === RideStatus.CANCELLED || prev.status === RideStatus.COMPLETED) {
            return prev;
        }
        return { ...prev, status: newStatus };
    });
  };

  const cancelRide = () => {
    if(ride) {
        setRide({ ...ride, status: RideStatus.CANCELLED });
        setDriverLiveLocation(null);
        setTimeout(() => {
            setRide(null);
            setLiveTripData(null);
        }, 3000);
    }
  };

  const completeRide = () => {
    if (ride) {
      const finalFare = liveTripData?.currentFare ?? getEstimatedFare(ride.vehicleType, ride.distance, ride.duration + Math.random() * 5); 
      setRide({ 
          ...ride, 
          status: RideStatus.COMPLETED, 
          finalFare, 
          completedAt: new Date().toISOString() 
      });
      setDriverLiveLocation(null);
      setTimeout(() => {
        setRide(null);
        setLiveTripData(null);
      }, 5000);
    }
  };
  
  // Effect to manage the live trip timer
  useEffect(() => {
    if (ride?.status === RideStatus.IN_PROGRESS) {
      if (!tripIntervalRef.current) {
        tripStartTimeRef.current = new Date();
        
        // Set initial state for the meter
        setLiveTripData({
          distanceTraveled: 0,
          timeElapsed: 0,
          currentFare: pricing[ride.vehicleType].baseFare,
        });

        const totalDistance = ride.distance;
        const totalDurationInSeconds = ride.duration * 60;

        tripIntervalRef.current = window.setInterval(() => {
          if (!tripStartTimeRef.current || !ride || ride.status !== RideStatus.IN_PROGRESS) {
              if (tripIntervalRef.current) {
                clearInterval(tripIntervalRef.current);
                tripIntervalRef.current = null;
              }
              return;
          }
          
          const now = new Date();
          const timeElapsed = (now.getTime() - tripStartTimeRef.current.getTime()) / 1000;

          // Simulate distance based on time progress for a smooth meter
          const progressRatio = totalDurationInSeconds > 0 ? Math.min(1, timeElapsed / totalDurationInSeconds) : 1;
          const distanceTraveled = totalDistance * progressRatio;

          // Calculate current fare
          const vehiclePricing = pricing[ride.vehicleType];
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
      // Cleanup: Stop the timer if ride is not in progress
      if (tripIntervalRef.current) {
        clearInterval(tripIntervalRef.current);
        tripIntervalRef.current = null;
        tripStartTimeRef.current = null;
      }
    }

    // Main cleanup function for the effect
    return () => {
      if (tripIntervalRef.current) {
        clearInterval(tripIntervalRef.current);
        tripIntervalRef.current = null;
      }
    };
  }, [ride, pricing]);


  const updatePricing = (newPricing: PricingSettings) => {
      setPricing(newPricing);
  };

  return (
    <RideContext.Provider value={{ ride, driverLiveLocation, liveTripData, pricing, requestRide, acceptRide, rejectRide, cancelRide, completeRide, updatePricing, getEstimatedFare, updateRideStatus, updateDriverLocation }}>
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