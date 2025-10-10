import React, { useState, useEffect, useMemo } from 'react';
import { RouteInfo, Step } from '../types';
import { getHaversineDistance } from '../services/mapService';

// --- Turn Arrow Icons ---
const TurnArrow: React.FC<{ type: number, className?: string }> = ({ type, className = "w-12 h-12" }) => {
    let path = "M12 2L4.5 20.29l.71.71L12 18l6.79 3l.71-.71L12 2z"; // Straight
    let transform = "";

    switch(type) {
        case 0: // Left
            path = "M20 11v2H8l5.5 5.5l-1.42 1.42L4.16 12l7.92-7.92L13.5 5.5L8 11h12z";
            break;
        case 1: // Right
            path = "M4 11v2h12l-5.5 5.5l1.42 1.42L19.84 12l-7.92-7.92L10.5 5.5L16 11H4z";
            break;
        case 2: // Sharp Left
            path = "M6.41 20L8 18.41L13.59 12.83L15.17 11.25L8 4L6.41 5.59L11 10.17V10H4v2h7v.17l-4.59 4.58L8 18.41L6.41 20z";
            break;
        case 3: // Sharp Right
            path = "M17.59 20L16 18.41L10.41 12.83L8.83 11.25L16 4l1.59 1.59L13 10.17V10h7v2h-7v.17l4.59 4.58L16 18.41L17.59 20z";
            break;
        case 4: // Slight Left
            path = "M14.08 15.59L12 13.5l-2.08 2.09L8.5 14.17l3.5-3.5l3.5 3.5l-1.42 1.42zM12 22C6.48 22 2 17.52 2 12S6.48 2 12 2s10 4.48 10 10s-4.48 10-10 10z";
            transform = "rotate(-45 12 12)";
            break;
        case 5: // Slight Right
            path = "M9.92 15.59L12 13.5l2.08 2.09L15.5 14.17l-3.5-3.5l-3.5 3.5l1.42 1.42zM12 22C6.48 22 2 17.52 2 12S6.48 2 12 2s10 4.48 10 10s-4.48 10-10 10z";
            transform = "rotate(45 12 12)";
            break;
        case 6: // Straight
            path = "M12 2L4.5 20.29l.71.71L12 18l6.79 3l.71-.71L12 2z";
            break;
        case 7: // Enter Roundabout
            path = "M16.75 12.5h-4.5v4.5H11v-4.5H6.5v-1h4.5V7H12v4.5h4.75v1zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8s8 3.59 8 8s-3.59 8-8 8z";
            break;
        default: // Default to Straight
            path = "M12 2L4.5 20.29l.71.71L12 18l6.79 3l.71-.71L12 2z";
    }

    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} fill="currentColor">
            <path d={path} transform={transform}></path>
        </svg>
    );
};

// --- Main UI Component ---
interface NavigationUIProps {
    routeInfo: RouteInfo | null;
    currentLocation: { lat: number, lng: number } | null;
    legProgress: { distance: number, duration: number } | null;
}

const NavigationUI: React.FC<NavigationUIProps> = ({ routeInfo, currentLocation, legProgress }) => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [distanceToNextManeuver, setDistanceToNextManeuver] = useState(0);

    const steps = useMemo(() => routeInfo?.steps || [], [routeInfo]);

    useEffect(() => {
        // Reset step index when a new route is provided
        setCurrentStepIndex(0);
    }, [routeInfo?.polyline]);

    useEffect(() => {
        if (!currentLocation || !routeInfo?.polyline || steps.length === 0) return;

        // Ensure we don't go out of bounds. The last step has no "next" step.
        if (currentStepIndex >= steps.length - 1) {
            setDistanceToNextManeuver(0);
            return;
        }

        const nextStep = steps[currentStepIndex + 1];
        const nextManeuverWayPointIndex = nextStep.way_points[0];
        const nextManeuverCoordsArray = routeInfo.polyline[nextManeuverWayPointIndex];

        if (!nextManeuverCoordsArray) return;

        const nextManeuverCoords = { lat: nextManeuverCoordsArray[0], lng: nextManeuverCoordsArray[1] };
        
        const distance = getHaversineDistance(currentLocation, nextManeuverCoords) * 1000; // in meters
        setDistanceToNextManeuver(distance);

        // Advance to the next step if user is very close to the current maneuver point
        const currentManeuverWayPointIndex = steps[currentStepIndex].way_points[0];
        const currentManeuverCoordsArray = routeInfo.polyline[currentManeuverWayPointIndex];
        if(!currentManeuverCoordsArray) return;

        const currentManeuverCoords = {lat: currentManeuverCoordsArray[0], lng: currentManeuverCoordsArray[1]}
        const distanceToCurrentManeuver = getHaversineDistance(currentLocation, currentManeuverCoords) * 1000;
        
        if (distanceToCurrentManeuver < 25 && currentStepIndex > 0) { // Don't auto-advance from the very first step
            setCurrentStepIndex(i => i + 1);
        }

    }, [currentLocation, routeInfo, steps, currentStepIndex]);
    
    const currentStep = useMemo(() => steps[currentStepIndex], [steps, currentStepIndex]);
    const nextStep = useMemo(() => (currentStepIndex + 1 < steps.length) ? steps[currentStepIndex + 1] : null, [steps, currentStepIndex]);

    if (!routeInfo || !currentLocation || !legProgress) {
        return null;
    }

    // --- Formatting Helpers ---
    const formatDistance = (meters: number) => {
        if (meters < 1000) {
            return `${Math.round(meters)} م`;
        }
        return `${(meters / 1000).toFixed(1)} كم`;
    };

    const formatTime = (minutes: number) => {
        const totalMinutes = Math.round(minutes);
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        if (hours > 0) {
            return `${hours} س ${mins} د`;
        }
        return `${mins} د`;
    };

    const getETA = (minutes: number) => {
        const etaDate = new Date(Date.now() + minutes * 60 * 1000);
        return etaDate.toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    return (
        <div className="absolute inset-0 z-10 pointer-events-none text-white flex flex-col justify-between p-4 animate-fade-in">
            {/* Top elements container */}
            <div className="space-y-2">
                {/* Current Street Name - Top Center */}
                <div className="w-full flex justify-center">
                    <div className="bg-slate-900/80 backdrop-blur-sm p-2 rounded-lg shadow-lg text-center px-6">
                        <p className="text-2xl font-bold">{currentStep?.name || "جاري حساب المسار..."}</p>
                    </div>
                </div>

                {/* Next Turn Instruction - Top Left */}
                {nextStep && (
                    <div className="bg-slate-900/80 backdrop-blur-sm p-3 rounded-xl shadow-lg flex items-center gap-4 max-w-sm">
                        <div className="flex-shrink-0 text-primary-light">
                            <TurnArrow type={nextStep.type} className="w-16 h-16"/>
                        </div>
                        <div>
                            <p className="text-3xl font-bold">{formatDistance(distanceToNextManeuver)}</p>
                            <p className="text-xl text-slate-200">{nextStep.instruction}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Info Bar */}
            <div className="bg-slate-900/80 backdrop-blur-sm p-3 rounded-xl shadow-lg">
                <div className="grid grid-cols-3 divide-x-2 divide-slate-600/50 rtl:divide-x-reverse text-center">
                    <div className="px-2">
                        <p className="text-sm text-slate-300">الوصول</p>
                        <p className="text-2xl lg:text-3xl font-bold">{getETA(legProgress.duration)}</p>
                    </div>
                    <div className="px-2">
                        <p className="text-sm text-slate-300">الوقت المتبقي</p>
                        <p className="text-2xl lg:text-3xl font-bold">{formatTime(legProgress.duration)}</p>
                    </div>
                    <div className="px-2">
                        <p className="text-sm text-slate-300">المسافة المتبقية</p>
                        <p className="text-2xl lg:text-3xl font-bold">{legProgress.distance.toFixed(1)} <span className="text-lg">كم</span></p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NavigationUI;
