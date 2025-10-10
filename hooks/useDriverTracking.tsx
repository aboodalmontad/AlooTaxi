import { useEffect, useRef, useCallback } from 'react';

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
 * Includes reliability improvements like a longer timeout, accuracy filtering, and an auto-retry mechanism.
 * @param isTracking - A boolean to enable or disable tracking.
 * @param callbacks - Memoized callback functions for success and error events.
 */
export const useDriverTracking = (isTracking: boolean, callbacks: TrackingCallbacks) => {
    const watchIdRef = useRef<number | null>(null);
    const retryTimeoutRef = useRef<number | null>(null);
    const { onSuccess, onError } = callbacks;

    const clearWatch = useCallback(() => {
        if (watchIdRef.current !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
    }, []);

    const clearRetryTimeout = useCallback(() => {
        if (retryTimeoutRef.current !== null) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
        }
    }, []);

    const startWatch = useCallback(() => {
        clearWatch();
        clearRetryTimeout();

        if (!navigator.geolocation) {
            console.error("[Tracking] Geolocation API is not supported by this browser.");
            // The component using this hook should ideally handle this case.
            return;
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                if (position.coords.accuracy > MIN_ACCURACY_METERS) {
                    console.warn(
                        `[Tracking] Ignored inaccurate position update. Accuracy: ${position.coords.accuracy.toFixed(1)}m (Threshold: ${MIN_ACCURACY_METERS}m)`
                    );
                    return;
                }
                onSuccess(position);
            },
            (error) => {
                console.error(`[Tracking] Geolocation watch error - Code: ${error.code}, Message: ${error.message}`);
                onError(error);

                if (error.code === error.PERMISSION_DENIED) {
                    clearWatch();
                    return;
                }
                
                // For transient errors, attempt to restart the watch after a delay.
                clearWatch();
                retryTimeoutRef.current = window.setTimeout(startWatch, 5000); // Retry after 5 seconds.
            },
            TRACKING_OPTIONS
        );
    }, [onSuccess, onError, clearWatch, clearRetryTimeout]);

    useEffect(() => {
        if (isTracking) {
            startWatch();
        } else {
            clearWatch();
            clearRetryTimeout();
        }

        return () => {
            clearWatch();
            clearRetryTimeout();
        };
    }, [isTracking, startWatch, clearWatch, clearRetryTimeout]);
};