import React, { useState, useEffect, useMemo } from 'react';
import { RouteInfo } from '../types';
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
}

const NavigationUI: React.FC<NavigationUIProps> = ({ routeInfo, currentLocation }) => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [distanceToNextManeuver, setDistanceToNextManeuver] = useState(0);

    const steps = useMemo(() => routeInfo?.steps || [], [routeInfo]);

    useEffect(() => {
        // Reset step index when a new route is provided
        setCurrentStepIndex(0);
    }, [routeInfo]);

    useEffect(() => {
        if (!currentLocation || !routeInfo?.polyline || steps.length === 0) return;

        // Advance to the next step if user is very close to the current maneuver point
        if (currentStepIndex < steps.length - 1) {
            const endOfStepWayPointIndex = steps[currentStepIndex].way_points[1];
            const maneuverCoordsArray = routeInfo.polyline[endOfStepWayPointIndex];
            if(maneuverCoordsArray) {
                const maneuverCoords = {lat: maneuverCoordsArray[0], lng: maneuverCoordsArray[1]};
                const distanceToManeuver = getHaversineDistance(currentLocation, maneuverCoords) * 1000;
                if (distanceToManeuver < 25) { // 25 meter threshold to advance
                    setCurrentStepIndex(i => i + 1);
                }
            }
        }
        
        // Calculate distance to the next maneuver (which is the end of the current step)
        const currentManeuverIdx = steps[currentStepIndex].way_points[1];
        const maneuverCoordsArr = routeInfo.polyline[currentManeuverIdx];
         if (maneuverCoordsArr) {
            const maneuverCoords = { lat: maneuverCoordsArr[0], lng: maneuverCoordsArr[1] };
            const distance = getHaversineDistance(currentLocation, maneuverCoords) * 1000;
            setDistanceToNextManeuver(distance);
        }

    }, [currentLocation, routeInfo, steps, currentStepIndex]);
    
    const currentStep = useMemo(() => steps[currentStepIndex], [steps, currentStepIndex]);

    if (!currentStep) {
        return (
            <div className="absolute top-0 inset-x-0 bg-[#37474F] p-4 shadow-lg z-20 flex items-center justify-center h-40">
                 <p className="text-2xl font-bold animate-pulse text-white">...جاري حساب التعليمات</p>
            </div>
        );
    }

    // --- Formatting Helpers ---
    const formatDistance = (meters: number) => {
        if (meters < 100) return { value: Math.max(0, Math.round(meters / 10) * 10), unit: 'م' };
        if (meters < 1000) return { value: Math.max(0, Math.round(meters / 50) * 50), unit: 'م' };
        return { value: (meters / 1000).toFixed(1), unit: 'كم' };
    };

    const distanceData = formatDistance(distanceToNextManeuver);
    const instructionText = currentStepIndex < steps.length - 1 
        ? currentStep.instruction 
        : 'لقد وصلت إلى وجهتك';
    const streetName = currentStep.name;

    return (
        <div className="absolute top-0 inset-x-0 bg-[#37474F] p-4 shadow-xl z-20 flex items-center justify-between h-40 animate-fade-in-down text-white">
            {/* The layout is reversed in order for RTL flexbox to render it visually as LTR (arrow on left) */}
            <div className="flex-1 text-center pr-4">
                <h2 className="text-6xl font-bold truncate">{streetName || instructionText}</h2>
            </div>
            
            <div className="flex-shrink-0 flex flex-col items-center text-center w-40">
                <div className="text-white">
                    <TurnArrow type={currentStep.type} className="w-24 h-24 drop-shadow-lg" />
                </div>
                {/* FIX: Cast distanceData.value to a number before comparison, as it can be a string from toFixed(). */}
                {Number(distanceData.value) > 0 && (
                    <p className="text-4xl font-bold mt-1">
                        {distanceData.value}<span className="text-2xl font-medium"> {distanceData.unit}</span>
                    </p>
                )}
            </div>
        </div>
    );
};

export default NavigationUI;
