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

  return (
    <div className="p-4 text-white pointer-events-none">
        {/*
          Responsive Grid:
          - Default: 1 column for mobile view (stacked vertically).
          - md (medium screens) and up: 3 columns for desktop view.
          - gap-y-4: Adds vertical spacing between items in the mobile view.
          - md:items-end: Aligns items to the bottom in desktop view for a cleaner look.
        */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-y-4 text-center md:items-end">
            <div className="px-2">
                <p className="text-lg md:text-base lg:text-lg text-slate-200 uppercase drop-shadow-lg">المسافة</p>
                {/*
                  Styling for the numbers:
                  - text-red-500: Changed color to red as requested.
                  - font-sans: Switched from mono to a more readable sans-serif font.
                  - text-6xl...: Made the font huge and responsive for all screen sizes.
                  - drop-shadow-xl: Added a crisp shadow for better readability against the map.
                */}
                <p className="text-red-500 text-6xl md:text-5xl lg:text-7xl font-sans font-bold tracking-tight drop-shadow-xl">
                    {distanceTraveled.toFixed(2)}
                    <span className="text-2xl lg:text-3xl ml-1">كم</span>
                </p>
            </div>
            <div className="px-2">
                <p className="text-lg md:text-base lg:text-lg text-slate-200 uppercase drop-shadow-lg">الزمن</p>
                <p className="text-red-500 text-6xl md:text-5xl lg:text-7xl font-sans font-bold tracking-tight drop-shadow-xl">
                    {formatTime(timeElapsed)}
                </p>
            </div>
            <div className="px-2">
                <p className="text-lg md:text-base lg:text-lg text-slate-200 uppercase drop-shadow-lg">الأجرة</p>
                <p className="text-red-500 text-6xl md:text-5xl lg:text-7xl font-sans font-bold tracking-tight drop-shadow-xl">
                    {currentFare.toLocaleString('ar-SY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    <span className="text-2xl lg:text-3xl ml-1">ل.س</span>
                </p>
            </div>
        </div>
    </div>
  );
};

export default LiveTripDisplay;