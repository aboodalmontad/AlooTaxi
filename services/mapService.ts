import { RouteInfo, LocationSuggestion, Step } from '../types';

let apiKey = '5b3ce3597851110001cf6248e12d4b05e23f4f36be3b1b7f7c69a82a';

export const setMapApiKey = (newKey: string) => {
    if (newKey && newKey.trim() !== '') {
        apiKey = newKey;
    }
};

/**
 * Decodes a polyline string into an array of lat/lng pairs.
 * @param encoded - The encoded polyline string.
 * @returns An array of coordinates `[latitude, longitude]`.
 */
const decodePolyline = (encoded: string): [number, number][] => {
    const points: [number, number][] = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;

    while (index < len) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;

        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;

        points.push([lat / 1e5, lng / 1e5]);
    }
    return points;
};


// Use standard directions endpoint, which works better with GET requests.
const DIRECTIONS_API_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';
const GEOCODE_API_URL = 'https://api.openrouteservice.org/geocode/search';


/**
 * Calculates the Haversine distance between two points on the Earth.
 * @param coords1 - The first coordinate object { lat, lng }.
 * @param coords2 - The second coordinate object { lat, lng }.
 * @returns The distance in kilometers.
 */
export const getHaversineDistance = (
  coords1: { lat: number; lng: number },
  coords2: { lat: number; lng: number }
): number => {
  const R = 6371; // Radius of the Earth in km
  const dLat = (coords2.lat - coords1.lat) * (Math.PI / 180);
  const dLon = (coords2.lng - coords1.lng) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coords1.lat * (Math.PI / 180)) *
      Math.cos(coords2.lat * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

/**
 * Checks if a location object has valid, non-zero coordinates.
 * @param loc - The location object to check.
 * @returns True if the location is valid, false otherwise.
 */
export const isValidLocation = (loc: { lat: number; lng: number } | null | undefined): loc is { lat: number; lng: number } => {
    return !!(
        loc &&
        typeof loc.lat === 'number' && !isNaN(loc.lat) &&
        typeof loc.lng === 'number' && !isNaN(loc.lng) &&
        (loc.lat !== 0 || loc.lng !== 0)
    );
};


export const getRoute = async (
  start: { lat: number, lng: number },
  end: { lat: number, lng: number }
): Promise<RouteInfo> => {
  // Enhanced defensive checks for coordinates using the new helper
  if (!isValidLocation(start) || !isValidLocation(end)) {
      const errorMsg = "إحداثيات بداية أو نهاية غير صالحة.";
      console.error("getRoute validation failed: Invalid coordinates provided.", { start, end });
      return Promise.reject(new Error(errorMsg));
  }
  
  // Pre-flight distance check to prevent pointless API calls that will surely fail.
  const haversineDistance = getHaversineDistance(start, end);

  // Pre-flight check for extremely close points to prevent API errors.
  const VERY_CLOSE_DISTANCE_KM = 0.05; // 50 meters
  if (haversineDistance < VERY_CLOSE_DISTANCE_KM) {
    console.warn(`Route calculation aborted pre-flight: points are too close (${haversineDistance.toFixed(4)}km). Returning zero-length route.`);
    return {
      distance: 0,
      duration: 0,
      polyline: [[start.lat, start.lng], [end.lat, end.lng]],
      steps: [],
    };
  }

  const MAX_REASONABLE_DISTANCE_KM = 1000; // A safe buffer for a country-wide app. Syria is ~800km wide.
  if (haversineDistance > MAX_REASONABLE_DISTANCE_KM) {
    const errorMsg = `المسافة بين النقطتين (${Math.round(haversineDistance)} كم) كبيرة جداً. يرجى التحقق من المواقع المحددة.`;
    console.error(`Route calculation aborted pre-flight due to excessive distance: ${haversineDistance.toFixed(2)}km`, { start, end });
    return Promise.reject(new Error(errorMsg));
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    start: `${start.lng},${start.lat}`,
    end: `${end.lng},${end.lat}`,
  });
  const url = `${DIRECTIONS_API_URL}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => response.text());
      console.error(`OpenRouteService API Error: Status ${response.status}`, JSON.stringify(errorBody, null, 2));
      
      if (response.status === 403) {
          throw new Error("مفتاح API غير صالح أو انتهت صلاحيته. يرجى مراجعة صفحة الإدارة لتحديثه.");
      }
      
      let errorMessage = "تعذر العثور على مسار. قد تكون المشكلة من خدمة الخرائط.";
      if (typeof errorBody === 'object' && errorBody?.error?.message) {
          if (errorBody.error.message.includes('approximated route distance must not be greater')) {
            errorMessage = "المسافة بين النقطتين كبيرة جداً ولا يمكن حساب مسار لها.";
          } else {
            errorMessage = errorBody.error.message;
          }
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Step 1: Check for explicit error object in the response body.
    if (data.error) {
        console.error("OpenRouteService API returned an error in the response body:", data.error);
        let userMessage = `خطأ من خدمة الخرائط: ${data.error.message || 'فشل غير معروف'}`;
        
        if (data.error.code === 2010 || data.error.message?.toLowerCase().includes('could not find point')) {
            userMessage = "تعذر العثور على إحدى النقاط على شبكة الطرق. يرجى محاولة تحديد موقع أقرب إلى الطريق.";
        } else if (data.error.code === 2004) {
             userMessage = "تعذر العثور على مسار بين النقطتين. قد تكونان بعيدتان جدًا أو لا يوجد طريق يربطهما.";
        }

        throw new Error(userMessage);
    }

    // Step 2: Extract the main route from the standard JSON response.
    const route = data?.routes?.[0];

    // Step 3: Check if no route was found.
    if (!route) {
        if (data.warnings && data.warnings.length > 0) {
            const warningMessage = data.warnings.map((w: any) => w.message).join(', ');
            console.warn("ORS returned warnings but no route:", warningMessage);
            throw new Error(`تعذر العثور على مسار. ملاحظة من خدمة الخرائط: ${warningMessage}`);
        }
        
        console.error("No route object found in ORS response:", data);
        throw new Error("تعذر إنشاء مسار صالح بين النقطتين. قد تكون إحدى النقاط غير قابلة للوصول أو خارج منطقة الخدمة.");
    }
    
    // Step 4: Validate and decode the route's geometry.
    const geometry = route.geometry;
    
    if (!geometry || typeof geometry !== 'string') {
        console.error("Invalid or incomplete geometry string in ORS route:", route);
        throw new Error("تم استلام بيانات مسار غير مكتملة من خدمة الخرائط.");
    }

    const polyline = decodePolyline(geometry);

    if (polyline.length < 2) {
      if (haversineDistance < VERY_CLOSE_DISTANCE_KM) {
        console.warn(`Polyline has < 2 points, but Haversine distance is very small (${haversineDistance.toFixed(4)}km). Treating as a zero-length route.`);
        return {
          distance: 0,
          duration: 0,
          polyline: [[start.lat, start.lng], [end.lat, end.lng]],
          steps: [],
        };
      }
      console.error("Could not form a valid polyline from geometry (less than 2 valid points).", { original: geometry, decoded: polyline });
      throw new Error("لا يمكن إنشاء خط مسار صالح من البيانات المستلمة. قد تكون نقاط المسار غير صالحة.");
    }

    // Step 5: Validate the summary object for distance and duration.
    const summary = route.summary;
    if (
        !summary || 
        typeof summary.distance !== 'number' ||
        typeof summary.duration !== 'number'
    ) {
        console.error("Invalid or missing summary in ORS route object:", route);
        throw new Error("تم استلام بيانات مسافة وزمن غير صالحة من خدمة الخرائط.");
    }
    
    const steps: Step[] = route?.segments?.[0]?.steps?.map((step: any) => ({
      distance: step.distance,
      duration: step.duration,
      type: step.type,
      instruction: step.instruction,
      name: step.name,
      way_points: step.way_points,
    })) || [];

    // Step 6: If all checks pass, format and return the data.
    return {
      distance: parseFloat((summary.distance / 1000).toFixed(2)), // meters to km
      duration: parseFloat((summary.duration / 60).toFixed(2)), // seconds to minutes
      polyline: polyline,
      steps: steps,
    };

  } catch (error) {
    console.error("A critical error occurred in getRoute:", error);
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
        throw new Error("فشل الاتصال بخدمة الخرائط. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.");
    }
    if (error instanceof Error) {
        // Re-throw the specific error to be handled by the UI
        throw error;
    }
    // Generic fallback for network issues etc.
    throw new Error("حدث خطأ في الشبكة أثناء محاولة حساب المسار. يرجى التحقق من اتصالك بالإنترنت.");
  }
};

export const searchLocations = async (query: string, focusPoint?: { lat: number, lng: number }): Promise<LocationSuggestion[]> => {
    if (!query || query.length < 3) return [];
    
    const params = new URLSearchParams({
        api_key: apiKey,
        text: query,
        lang: 'ar',
    });

    if (focusPoint) {
        params.append('focus.point.lon', focusPoint.lng.toString());
        params.append('focus.point.lat', focusPoint.lat.toString());
    }
    
    const url = `${GEOCODE_API_URL}?${params.toString()}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
            }
        });
        if (!response.ok) {
            console.error('Error from OpenRouteService Geocode:', await response.text());
            throw new Error('Failed to fetch locations');
        }
        const data = await response.json();
        
        if (data && data.features && Array.isArray(data.features)) {
            return data.features.map((feature: any) => ({
                name: feature.properties.label,
                coordinates: {
                    lat: feature.geometry.coordinates[1],
                    lng: feature.geometry.coordinates[0],
                },
            }));
        }
        
        return [];
    } catch (error) {
        console.error("Error searching locations:", error);
        if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
            console.error("Failed to fetch location suggestions due to network error.");
        }
        return [];
    }
};
