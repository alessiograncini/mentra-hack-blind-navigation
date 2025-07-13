/**
 * Navigation Instructions Utility Functions
 * Handles processing, formatting, and voice generation for navigation instructions
 */

import { NavigationInstruction, DistanceUnits, NavigationSettings } from '../types/navigation.js';
import { formatDistance, formatDuration } from './distance.js';

/**
 * Convert turn maneuver codes to human-readable directions
 */
const MANEUVER_INSTRUCTIONS: Record<string, string> = {
  'turn-left': 'Turn left',
  'turn-right': 'Turn right',
  'turn-slight-left': 'Turn slightly left',
  'turn-slight-right': 'Turn slightly right',
  'turn-sharp-left': 'Turn sharply left',
  'turn-sharp-right': 'Turn sharply right',
  'uturn-left': 'Make a U-turn to the left',
  'uturn-right': 'Make a U-turn to the right',
  'continue': 'Continue straight',
  'merge': 'Merge',
  'on-ramp': 'Take the on-ramp',
  'off-ramp': 'Take the off-ramp',
  'fork-left': 'Keep left at the fork',
  'fork-right': 'Keep right at the fork',
  'roundabout-exit-1': 'At the roundabout, take the 1st exit',
  'roundabout-exit-2': 'At the roundabout, take the 2nd exit',
  'roundabout-exit-3': 'At the roundabout, take the 3rd exit',
  'roundabout-exit-4': 'At the roundabout, take the 4th exit',
  'roundabout-exit-5': 'At the roundabout, take the 5th exit',
  'arrive': 'Arrive at your destination',
  'arrive-left': 'Arrive at your destination on the left',
  'arrive-right': 'Arrive at your destination on the right'
};

/**
 * Generate a human-readable instruction from a navigation step
 * @param instruction Navigation instruction object
 * @param units Distance units preference
 * @param isVoice Whether this is for voice output (more natural language)
 * @returns Formatted instruction string
 */
export function formatInstruction(
  instruction: NavigationInstruction,
  units: DistanceUnits,
  isVoice: boolean = false
): string {
  const distance = formatDistance(instruction.distance, units);
  const baseInstruction = MANEUVER_INSTRUCTIONS[instruction.maneuver || 'continue'] || instruction.instruction;

  if (instruction.isDestination) {
    return isVoice ? 'You have arrived at your destination' : 'Destination reached';
  }

  let formatted = baseInstruction;

  // Add street name if available
  if (instruction.streetName) {
    if (instruction.maneuver?.includes('turn') || instruction.maneuver?.includes('uturn')) {
      formatted += ` onto ${instruction.streetName}`;
    } else if (instruction.maneuver === 'continue') {
      formatted = `Continue on ${instruction.streetName}`;
    }
  }

  // Add exit number for highway instructions
  if (instruction.exitNumber) {
    formatted += ` (Exit ${instruction.exitNumber})`;
  }

  // Add distance for voice instructions
  if (isVoice && instruction.distance > 50) {
    if (instruction.distance > 800) {
      formatted = `In ${distance}, ${formatted.toLowerCase()}`;
    } else {
      formatted = `In ${distance}, ${formatted.toLowerCase()}`;
    }
  }

  return formatted;
}

/**
 * Generate voice announcement text based on distance to next turn
 * @param instruction Next navigation instruction
 * @param distance Distance to the instruction in meters
 * @param units Distance units preference
 * @param settings Navigation settings
 * @returns Voice announcement text or null if no announcement needed
 */
export function generateVoiceAnnouncement(
  instruction: NavigationInstruction,
  distance: number,
  units: DistanceUnits,
  settings: NavigationSettings
): string | null {
  if (!settings.voice_guidance) {
    return null;
  }

  const announcement = formatInstruction(instruction, units, true);
  
  // Determine announcement thresholds based on frequency setting
  const thresholds = getAnnouncementThresholds(settings.announcement_frequency);
  
  // Check if we should announce at this distance
  const shouldAnnounce = thresholds.some(threshold => 
    Math.abs(distance - threshold) < 10 // Within 10 meters of threshold
  );

  if (!shouldAnnounce) {
    return null;
  }

  return announcement;
}

/**
 * Get distance thresholds for voice announcements based on frequency setting
 * @param frequency Announcement frequency (1-5 scale)
 * @returns Array of distance thresholds in meters
 */
function getAnnouncementThresholds(frequency: number): number[] {
  switch (frequency) {
    case 1: // Minimal
      return [500, 100];
    case 2: // Low
      return [800, 300, 100];
    case 3: // Normal
      return [1000, 500, 200, 50];
    case 4: // Frequent
      return [1500, 1000, 500, 200, 100, 50];
    case 5: // Maximum
      return [2000, 1500, 1000, 500, 300, 200, 100, 50];
    default:
      return [1000, 500, 200, 50];
  }
}

/**
 * Clean and simplify HTML instructions from mapping services
 * @param htmlInstruction HTML instruction from Google Maps or similar
 * @returns Clean text instruction
 */
export function cleanInstruction(htmlInstruction: string): string {
  // Remove HTML tags
  let cleaned = htmlInstruction.replace(/<[^>]*>/g, '');
  
  // Replace HTML entities
  cleaned = cleaned
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

/**
 * Extract maneuver type from instruction text
 * @param instruction Instruction text
 * @returns Maneuver type or 'continue' as default
 */
export function extractManeuver(instruction: string): string {
  const lowerInstruction = instruction.toLowerCase();
  
  if (lowerInstruction.includes('turn left')) return 'turn-left';
  if (lowerInstruction.includes('turn right')) return 'turn-right';
  if (lowerInstruction.includes('slight left')) return 'turn-slight-left';
  if (lowerInstruction.includes('slight right')) return 'turn-slight-right';
  if (lowerInstruction.includes('sharp left')) return 'turn-sharp-left';
  if (lowerInstruction.includes('sharp right')) return 'turn-sharp-right';
  if (lowerInstruction.includes('u-turn') || lowerInstruction.includes('u turn')) {
    return lowerInstruction.includes('left') ? 'uturn-left' : 'uturn-right';
  }
  if (lowerInstruction.includes('roundabout')) {
    if (lowerInstruction.includes('1st') || lowerInstruction.includes('first')) return 'roundabout-exit-1';
    if (lowerInstruction.includes('2nd') || lowerInstruction.includes('second')) return 'roundabout-exit-2';
    if (lowerInstruction.includes('3rd') || lowerInstruction.includes('third')) return 'roundabout-exit-3';
    if (lowerInstruction.includes('4th') || lowerInstruction.includes('fourth')) return 'roundabout-exit-4';
    if (lowerInstruction.includes('5th') || lowerInstruction.includes('fifth')) return 'roundabout-exit-5';
  }
  if (lowerInstruction.includes('merge')) return 'merge';
  if (lowerInstruction.includes('on-ramp') || lowerInstruction.includes('on ramp')) return 'on-ramp';
  if (lowerInstruction.includes('off-ramp') || lowerInstruction.includes('off ramp')) return 'off-ramp';
  if (lowerInstruction.includes('keep left')) return 'fork-left';
  if (lowerInstruction.includes('keep right')) return 'fork-right';
  if (lowerInstruction.includes('destination')) {
    if (lowerInstruction.includes('left')) return 'arrive-left';
    if (lowerInstruction.includes('right')) return 'arrive-right';
    return 'arrive';
  }
  
  return 'continue';
}

/**
 * Extract street name from instruction text
 * @param instruction Instruction text
 * @returns Street name or undefined if not found
 */
export function extractStreetName(instruction: string): string | undefined {
  // Look for patterns like "onto Main St", "on Highway 101", etc.
  const patterns = [
    /onto\s+([^,\.]+)/i,
    /on\s+([^,\.]+)/i,
    /toward\s+([^,\.]+)/i,
    /continue\s+on\s+([^,\.]+)/i
  ];

  for (const pattern of patterns) {
    const match = instruction.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}

/**
 * Create a concise display instruction for smart glasses
 * @param instruction Navigation instruction
 * @param units Distance units
 * @returns Short instruction suitable for glasses display
 */
export function formatDisplayInstruction(
  instruction: NavigationInstruction,
  units: DistanceUnits
): string {
  const distance = formatDistance(instruction.distance, units);
  
  if (instruction.isDestination) {
    return 'Destination';
  }

  let display = '';
  
  // Use symbols for common maneuvers
  switch (instruction.maneuver) {
    case 'turn-left':
      display = '← ';
      break;
    case 'turn-right':
      display = '→ ';
      break;
    case 'turn-slight-left':
      display = '↖ ';
      break;
    case 'turn-slight-right':
      display = '↗ ';
      break;
    case 'continue':
      display = '↑ ';
      break;
    case 'uturn-left':
    case 'uturn-right':
      display = '↻ ';
      break;
    default:
      display = '';
  }

  // Add street name if available and short enough
  if (instruction.streetName && instruction.streetName.length < 20) {
    display += instruction.streetName;
  } else {
    // Use simplified direction
    const simpleInstruction = MANEUVER_INSTRUCTIONS[instruction.maneuver || 'continue'] || 'Continue';
    display += simpleInstruction.replace(/^(Turn|Continue|Make a)?\s*/i, '');
  }

  return `${distance} - ${display}`;
}

/**
 * Generate progress announcement for long distances
 * @param remainingDistance Distance remaining to destination in meters
 * @param units Distance units
 * @returns Progress announcement or null
 */
export function generateProgressAnnouncement(
  remainingDistance: number,
  units: DistanceUnits
): string | null {
  const formattedDistance = formatDistance(remainingDistance, units);
  
  // Only announce at significant milestones
  const milestones = units === 'imperial' 
    ? [50 * 1609.34, 25 * 1609.34, 10 * 1609.34, 5 * 1609.34, 1609.34] // Miles to meters
    : [100000, 50000, 25000, 10000, 5000, 1000]; // Meters

  const isAtMilestone = milestones.some(milestone => 
    Math.abs(remainingDistance - milestone) < 100
  );

  if (!isAtMilestone) {
    return null;
  }

  return `${formattedDistance} remaining to destination`;
} 