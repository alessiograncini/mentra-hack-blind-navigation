/**
 * Distance and Location Utility Functions
 * Provides functions for distance calculations, unit conversions, and geographic utilities
 */

import { Coordinates, DistanceUnits } from '../types/navigation.js';

/**
 * Calculate the distance between two coordinates using the Haversine formula
 * @param point1 First coordinate point
 * @param point2 Second coordinate point
 * @returns Distance in meters
 */
export function calculateDistance(point1: Coordinates, point2: Coordinates): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = point1.lat * Math.PI / 180;
  const φ2 = point2.lat * Math.PI / 180;
  const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
  const Δλ = (point2.lng - point1.lng) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate the bearing (direction) from one point to another
 * @param point1 Starting point
 * @param point2 Destination point
 * @returns Bearing in degrees (0-360)
 */
export function calculateBearing(point1: Coordinates, point2: Coordinates): number {
  const φ1 = point1.lat * Math.PI / 180;
  const φ2 = point2.lat * Math.PI / 180;
  const Δλ = (point2.lng - point1.lng) * Math.PI / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  return ((θ * 180 / Math.PI) + 360) % 360;
}

/**
 * Format distance for display based on user's preferred units
 * @param meters Distance in meters
 * @param units User's preferred distance units
 * @param precision Number of decimal places (default: 1)
 * @returns Formatted distance string
 */
export function formatDistance(meters: number, units: DistanceUnits, precision: number = 1): string {
  if (units === 'imperial') {
    const feet = meters * 3.28084;
    const miles = feet / 5280;

    if (miles >= 0.1) {
      return `${miles.toFixed(precision)} mi`;
    } else {
      return `${Math.round(feet)} ft`;
    }
  } else {
    const kilometers = meters / 1000;

    if (kilometers >= 1) {
      return `${kilometers.toFixed(precision)} km`;
    } else {
      return `${Math.round(meters)} m`;
    }
  }
}

/**
 * Format speed for display based on user's preferred units
 * @param metersPerSecond Speed in meters per second
 * @param units User's preferred distance units
 * @returns Formatted speed string
 */
export function formatSpeed(metersPerSecond: number, units: DistanceUnits): string {
  if (units === 'imperial') {
    const mph = metersPerSecond * 2.237;
    return `${Math.round(mph)} mph`;
  } else {
    const kmh = metersPerSecond * 3.6;
    return `${Math.round(kmh)} km/h`;
  }
}

/**
 * Format duration for display
 * @param seconds Duration in seconds
 * @param short Whether to use short format (5m vs 5 minutes)
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number, short: boolean = false): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (short) {
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  } else {
    if (hours > 0) {
      const hourText = hours === 1 ? 'hour' : 'hours';
      const minuteText = minutes === 1 ? 'minute' : 'minutes';
      return `${hours} ${hourText}${minutes > 0 ? ` ${minutes} ${minuteText}` : ''}`;
    } else {
      const minuteText = minutes === 1 ? 'minute' : 'minutes';
      return `${minutes} ${minuteText}`;
    }
  }
}

/**
 * Check if a point is within a certain radius of another point
 * @param point1 First point
 * @param point2 Second point
 * @param radiusMeters Radius in meters
 * @returns True if point1 is within radius of point2
 */
export function isWithinRadius(point1: Coordinates, point2: Coordinates, radiusMeters: number): boolean {
  return calculateDistance(point1, point2) <= radiusMeters;
}

/**
 * Convert coordinates to a string representation
 * @param coordinates Coordinates to convert
 * @param precision Number of decimal places (default: 6)
 * @returns String representation of coordinates
 */
export function coordinatesToString(coordinates: Coordinates, precision: number = 6): string {
  return `${coordinates.lat.toFixed(precision)},${coordinates.lng.toFixed(precision)}`;
}

/**
 * Parse coordinates from a string
 * @param coordString String representation of coordinates
 * @returns Parsed coordinates or null if invalid
 */
export function stringToCoordinates(coordString: string): Coordinates | null {
  const parts = coordString.split(',');
  if (parts.length !== 2) return null;

  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());

  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

/**
 * Calculate the midpoint between two coordinates
 * @param point1 First point
 * @param point2 Second point
 * @returns Midpoint coordinates
 */
export function calculateMidpoint(point1: Coordinates, point2: Coordinates): Coordinates {
  const φ1 = point1.lat * Math.PI / 180;
  const φ2 = point2.lat * Math.PI / 180;
  const Δλ = (point2.lng - point1.lng) * Math.PI / 180;

  const Bx = Math.cos(φ2) * Math.cos(Δλ);
  const By = Math.cos(φ2) * Math.sin(Δλ);

  const φ3 = Math.atan2(Math.sin(φ1) + Math.sin(φ2),
    Math.sqrt((Math.cos(φ1) + Bx) * (Math.cos(φ1) + Bx) + By * By));
  const λ3 = point1.lng * Math.PI / 180 + Math.atan2(By, Math.cos(φ1) + Bx);

  return {
    lat: φ3 * 180 / Math.PI,
    lng: λ3 * 180 / Math.PI
  };
}

/**
 * Find the closest point on a line segment to a given point
 * @param point The point to find the closest position to
 * @param lineStart Start of the line segment
 * @param lineEnd End of the line segment
 * @returns Closest point on the line segment
 */
export function closestPointOnLine(
  point: Coordinates,
  lineStart: Coordinates,
  lineEnd: Coordinates
): Coordinates {
  const A = point.lat - lineStart.lat;
  const B = point.lng - lineStart.lng;
  const C = lineEnd.lat - lineStart.lat;
  const D = lineEnd.lng - lineStart.lng;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;

  let param = -1;
  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = lineStart.lat;
    yy = lineStart.lng;
  } else if (param > 1) {
    xx = lineEnd.lat;
    yy = lineEnd.lng;
  } else {
    xx = lineStart.lat + param * C;
    yy = lineStart.lng + param * D;
  }

  return { lat: xx, lng: yy };
}

/**
 * Check if coordinates are valid
 * @param coordinates Coordinates to validate
 * @returns True if coordinates are valid
 */
export function validateCoordinates(coordinates: Coordinates): boolean {
  return (
    typeof coordinates.lat === 'number' &&
    typeof coordinates.lng === 'number' &&
    coordinates.lat >= -90 &&
    coordinates.lat <= 90 &&
    coordinates.lng >= -180 &&
    coordinates.lng <= 180 &&
    !isNaN(coordinates.lat) &&
    !isNaN(coordinates.lng)
  );
}

/**
 * Convert degrees to radians
 * @param degrees Degrees to convert
 * @returns Radians
 */
export function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

/**
 * Convert radians to degrees
 * @param radians Radians to convert
 * @returns Degrees
 */
export function radiansToDegrees(radians: number): number {
  return radians * 180 / Math.PI;
}

/**
 * Get directional arrow based on bearing
 * @param bearing Bearing in degrees (0-360)
 * @returns Arrow character (^, >, v, <)
 */
export function getDirectionalArrow(bearing: number): string {
  // Normalize bearing to 0-360
  const normalizedBearing = ((bearing % 360) + 360) % 360;
  
  // Convert to arrow based on 8 directional segments
  // ^ (up/north): 337.5-22.5 degrees
  // > (right/east): 67.5-112.5 degrees  
  // v (down/south): 157.5-202.5 degrees
  // < (left/west): 247.5-292.5 degrees
  
  if (normalizedBearing >= 337.5 || normalizedBearing < 22.5) {
    return '^'; // North
  } else if (normalizedBearing >= 22.5 && normalizedBearing < 67.5) {
    return '>'; // Northeast -> use right arrow
  } else if (normalizedBearing >= 67.5 && normalizedBearing < 112.5) {
    return '>'; // East
  } else if (normalizedBearing >= 112.5 && normalizedBearing < 157.5) {
    return '>'; // Southeast -> use right arrow
  } else if (normalizedBearing >= 157.5 && normalizedBearing < 202.5) {
    return 'v'; // South
  } else if (normalizedBearing >= 202.5 && normalizedBearing < 247.5) {
    return '<'; // Southwest -> use left arrow
  } else if (normalizedBearing >= 247.5 && normalizedBearing < 292.5) {
    return '<'; // West
  } else {
    return '<'; // Northwest -> use left arrow
  }
} 