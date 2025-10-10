import { useEffect, useRef } from 'react';

// Configuration for the Geolocation API
const TRACKING_OPTIONS: PositionOptions = {
    enableHighAccuracy: true,
    // Increased timeout to 20 seconds to allow more time for a GPS lock, improving reliability.
    timeout: 20000, 
    // Do not use a cached position. Always get the real-time location.
    maximumAge: 0,
};

// Ignore GPS updates that are less accurate than this value (in meters).
// This prevents the driver's icon from jumping around due to inaccurate readings.
const MIN_ACCURACY_METERS = 100;

interface TrackingCallbacks {
    onSuccess: (position: GeolocationPosition) => void;
    onError: (error: GeolocationPositionError) => void;
}

/**
 * A custom hook to manage real-time geolocation tracking for drivers.
 * It encapsulates the logic for starting, stopping, and handling updates from `watchPosition`.
 * Includes reliability improvements like a longer timeout and accuracy filtering.
 * @param isTracking - A boolean to enable or disable tracking.
 * @param callbacks - Memoized callback functions for success and error events.
 */
export const useDriverTracking = (isTracking: boolean, callbacks: TrackingCallbacks) => {
    const watchIdRef = useRef<number | null>(null);
    
    // Destructure callbacks to ensure the effect hook's dependency array is stable.
    const { onSuccess, onError } = callbacks;

    useEffect(() => {
        // Stop tracking if the `isTracking` flag is false.
        if (!isTracking) {
            if (watchIdRef.current && navigator.geolocation) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            return;
        }

        // Start tracking if geolocation is available and not already watching.
        if (navigator.geolocation && watchIdRef.current === null) {
            watchIdRef.current = navigator.geolocation.watchPosition(
                (position) => {
                    // --- ACCURACY FILTER ---
                    // Only accept position updates that are reasonably accurate.
                    if (position.coords.accuracy > MIN_ACCURACY_METERS) {
                        console.warn(
                            `[Tracking] Ignored inaccurate position update. Accuracy: ${position.coords.accuracy.toFixed(1)}m (Threshold: ${MIN_ACCURACY_METERS}m)`
                        );
                        return;
                    }
                    onSuccess(position);
                },
                (error) => {
                    console.error("[Tracking] Geolocation watch error:", error);
                    onError(error);
                },
                TRACKING_OPTIONS
            );
        }

        // Cleanup function to clear the watch when the component unmounts or `isTracking` becomes false.
        return () => {
            if (watchIdRef.current && navigator.geolocation) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, [isTracking, onSuccess, onError]);
};
