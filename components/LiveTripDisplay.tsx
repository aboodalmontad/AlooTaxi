import React from 'react';

interface LiveTripDisplayProps {
  distanceTraveled: number; // in km
  timeElapsed: number; // in seconds
  currentFare: number;
}

const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const padded = (num: number) => num.toString().padStart(2, '0');

    if (hours > 0) {
        return `${padded(hours)}:${padded(minutes)}:${padded(seconds)}`;
    }
    return `${padded(minutes)}:${padded(seconds)}`;
};

const LiveTripDisplay: React.FC<LiveTripDisplayProps> = ({
  distanceTraveled,
  timeElapsed,
  currentFare,
}) => {
  // A strong text shadow ensures readability over any map background.
  const textShadowClass = "[text-shadow:0_3px_7px_rgba(0,0,0,0.9)]";

  return (
    <div className="p-4 text-white pointer-events-none">
        <div className="grid grid-cols-3 text-center items-end">
            <div className="px-2">
                <p className={`text-base lg:text-lg text-slate-200 uppercase ${textShadowClass}`}>المسافة</p>
                <p className={`text-5xl lg:text-7xl font-mono font-bold tracking-tight ${textShadowClass}`}>
                    {distanceTraveled.toFixed(2)}
                    <span className="text-xl lg:text-3xl ml-1 font-sans">كم</span>
                </p>
            </div>
            <div className="px-2">
                <p className={`text-base lg:text-lg text-slate-200 uppercase ${textShadowClass}`}>الزمن</p>
                <p className={`text-5xl lg:text-7xl font-mono font-bold tracking-tight ${textShadowClass}`}>
                    {formatTime(timeElapsed)}
                </p>
            </div>
            <div className="px-2">
                <p className={`text-base lg:text-lg text-slate-200 uppercase ${textShadowClass}`}>الأجرة</p>
                <p className={`text-5xl lg:text-7xl font-mono font-bold tracking-tight ${textShadowClass}`}>
                    {currentFare.toLocaleString('ar-SY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    <span className="text-xl lg:text-3xl ml-1 font-sans">ل.س</span>
                </p>
            </div>
        </div>
    </div>
  );
};

export default LiveTripDisplay;
