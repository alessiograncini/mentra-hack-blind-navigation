/**
 * MentraOS Navigation App
 * Main application file that integrates GPS navigation with MentraOS smart glasses
 */

import 'dotenv/config';
import { AppServer, AppSession, ToolCall } from '@mentra/sdk';
import path from 'path';
import { NavigationManager } from './services/navigationManager.js';
import { MappingService } from './services/mappingService.js';
import { NavigationSettings, Coordinates, PlaceSearchResult } from './types/navigation.js';

// Load configuration from environment variables
const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');

/**
 * MentraOS Navigation App
 * Provides turn-by-turn GPS navigation with voice guidance for smart glasses
 */
class NavigationApp extends AppServer {
  private mappingService: MappingService;
  private userNavigationManagers = new Map<string, NavigationManager>();
  private userSessions = new Map<string, AppSession>();

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
      publicDir: path.resolve(__dirname, '../public'),
    });

    this.mappingService = new MappingService();
    console.log('🧭 MentraOS Navigation App initialized');
  }

  /**
   * Handle tool calls from voice commands
   */
  protected async onToolCall(toolCall: ToolCall): Promise<string | undefined> {
    const { toolId, toolParameters, userId } = toolCall;
    console.log(`🎙️ TOOL CALL RECEIVED:`, {
      toolId,
      toolParameters,
      userId,
      timestamp: new Date().toISOString()
    });
    
    const session = this.userSessions.get(userId);
    const navigationManager = this.userNavigationManagers.get(userId);

    if (!session) {
      console.log(`❌ No session found for user ${userId}`);
      return 'Navigation app is not active. Please start the app first.';
    }

    console.log(`🎙️ Processing tool: ${toolId} for user ${userId}`);

    try {
      switch (toolId) {
        case 'restart_session':
          return this.handleRestartSession(navigationManager);

        case 'navigate_to_destination':
          return await this.handleNavigateToDestination(toolParameters?.destination as string, navigationManager, session);

        case 'find_nearby_places':
          return await this.handleFindNearbyPlaces(toolParameters?.place_type as string, navigationManager, session);

        case 'cancel_navigation':
          return this.handleCancelNavigation(navigationManager);

        case 'navigation_status':
          return this.handleNavigationStatus(navigationManager);

        case 'alternative_route':
          return await this.handleAlternativeRoute(navigationManager);

        case 'add_waypoint':
          return await this.handleAddWaypoint(toolParameters?.waypoint as string, navigationManager);

        case 'report_traffic':
          return this.handleReportTraffic(toolParameters?.report_type as string, navigationManager);

        default:
          return `Unknown navigation command: ${toolId}`;
      }
    } catch (error) {
      console.error(`Error handling tool call ${toolId}:`, error);
      return 'An error occurred while processing your request. Please try again.';
    }
  }

  /**
   * Handle new user sessions
   */
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    console.log(`🚀 NAVIGATION SESSION STARTED:`, {
      userId,
      sessionId,
      timestamp: new Date().toISOString(),
      totalSessions: this.userSessions.size + 1
    });

    // Store session reference
    this.userSessions.set(userId, session);

    // Initialize navigation settings from user preferences
    const settings = this.getNavigationSettings(session);

    // Create navigation manager for this user
    const navigationManager = new NavigationManager(session, settings);
    this.userNavigationManagers.set(userId, navigationManager);

    // Set up event handlers
    this.setupEventHandlers(session, navigationManager, userId);

    // Show welcome message
    session.layouts.showTextWall(
      '🧭 Navigation Ready!\n\nSay:\n• "Navigate to [destination]"\n• "Find nearby [place type]"\n• "Navigation status"',
      { durationMs: 8000 }
    );

    // Handle transcription for manual address input
    session.events.onTranscription((data: any) => {
      console.log(`🎤 Transcription received for user ${userId}:`, {
        text: data.text,
        isFinal: data.isFinal
      });
      
      if (data.isFinal && data.text.length > 5) {
        console.log(`🎯 Processing final transcription: "${data.text}"`);
        this.handleTranscriptionInput(data.text, navigationManager, session);
      }
    });

    // Handle location updates with better error handling
    await this.setupLocationTracking(session, navigationManager, userId);

    // Handle settings changes
    session.settings.onValueChange('route_type', (newValue: any, oldValue: any) => {
      console.log(`Route type changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.updateNavigationSettings(session, navigationManager);
    });

    session.settings.onValueChange('transportation_mode', (newValue: any, oldValue: any) => {
      console.log(`Transportation mode changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.updateNavigationSettings(session, navigationManager);
    });

    session.settings.onValueChange('voice_guidance', (newValue: any, oldValue: any) => {
      console.log(`Voice guidance changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.updateNavigationSettings(session, navigationManager);
    });

    // Clean up when session ends
    this.addCleanupHandler(() => this.userSessions.delete(userId));
  }

  /**
   * Tool call handlers
   */

  private handleRestartSession(navigationManager: NavigationManager | undefined): string {
    if (!navigationManager) {
      return 'Navigation manager not available.';
    }

    navigationManager.restartSession();
    return 'Session restarted! You can now navigate to a new destination.';
  }

  private async handleNavigateToDestination(
    destination: string,
    navigationManager: NavigationManager | undefined,
    session: AppSession
  ): Promise<string> {
    if (!destination) {
      return 'Please specify a destination. For example: "Navigate to 123 Main Street" or "Navigate to Starbucks"';
    }

    if (!navigationManager) {
      return 'Navigation manager not initialized. Please restart the app.';
    }

    // Check if session is locked
    if (navigationManager.isSessionLocked()) {
      return 'Navigation session is locked. Say "restart session" to start a new route.';
    }

    try {
      // Show processing message
      session.layouts.showTextWall('🧭 Calculating route...', { durationMs: 3000 });

      // Get current location using real location services
      let currentLocation: Coordinates;
      try {
        // Use basic accuracy following docs pattern
        const locationUpdate = await session.location.getLatestLocation({ accuracy: 'reduced' });
        currentLocation = { lat: locationUpdate.lat, lng: locationUpdate.lng };
        console.log('📍 Using real location:', currentLocation);
      } catch (locationError) {
        console.error('Failed to get current location:', locationError);
        
        // Provide more specific error feedback
        if (locationError instanceof Error) {
          if (locationError.message.includes('permission')) {
            return 'Location permission denied. Please enable location access in your device settings and restart the app.';
          } else if (locationError.message.includes('timeout')) {
            return 'Location request timed out. Please move to an area with better GPS signal and try again.';
          } else if (locationError.message.includes('unavailable')) {
            return 'Location services are currently unavailable. Please check your device settings and try again.';
          }
        }
        
        return 'Unable to get current location. Please ensure location services are enabled and try again.';
      }

      const success = await navigationManager.startNavigation(destination);
      if (success) {
        return `Navigation started to ${destination}. Follow the directions on your display.`;
      } else {
        return `Unable to calculate route to "${destination}". Please check the address and try again.`;
      }
    } catch (error) {
      console.error('Error starting navigation:', error);
      return 'Error starting navigation. Please try again.';
    }
  }

  private async handleFindNearbyPlaces(
    placeType: string,
    navigationManager: NavigationManager | undefined,
    session: AppSession
  ): Promise<string> {
    if (!placeType) {
      return 'Please specify what you\'re looking for. For example: "Find nearby gas stations" or "Find nearest restaurant"';
    }

    if (!navigationManager) {
      return 'Navigation manager not initialized. Please restart the app.';
    }

    // Check if session is locked
    if (navigationManager.isSessionLocked()) {
      return 'Navigation session is locked. Say "restart session" to start a new search.';
    }

    try {
      // Get current location using real location services
      let currentLocation: Coordinates;
      try {
        // Use basic accuracy for place search - following docs pattern
        const locationUpdate = await session.location.getLatestLocation({ accuracy: 'reduced' });
        currentLocation = { lat: locationUpdate.lat, lng: locationUpdate.lng };
        console.log('📍 Using real location for search:', currentLocation);
      } catch (locationError) {
        console.error('Failed to get current location:', locationError);
        
        // Provide more specific error feedback
        if (locationError instanceof Error) {
          if (locationError.message.includes('permission')) {
            return 'Location permission denied. Please enable location access in your device settings and restart the app.';
          } else if (locationError.message.includes('timeout')) {
            return 'Location request timed out. Please move to an area with better GPS signal and try again.';
          } else if (locationError.message.includes('unavailable')) {
            return 'Location services are currently unavailable. Please check your device settings and try again.';
          }
        }
        
        return 'Unable to get current location. Please ensure location services are enabled and try again.';
      }

      // Search for places
      const places = await this.mappingService.searchPlaces(placeType, currentLocation, 5000);
      
      if (places.length === 0) {
        return `No ${placeType} found nearby. Try searching for something else.`;
      }

      // Show results
      const nearestPlace = places[0];
      const distance = nearestPlace.distance ? Math.round(nearestPlace.distance) : 'unknown';
      
      let resultText = `Found ${places.length} ${placeType}${places.length > 1 ? 's' : ''} nearby.\n\n`;
      resultText += `Nearest: ${nearestPlace.name}\n`;
      resultText += `Distance: ${distance}m\n`;
      resultText += `Address: ${nearestPlace.formatted_address}\n\n`;
      resultText += 'Say "Navigate to [place name]" to start directions.';

      session.layouts.showTextWall(resultText, { durationMs: 10000 });

      return `Found ${nearestPlace.name} ${distance}m away. Say "Navigate to ${nearestPlace.name}" to start directions.`;
    } catch (error) {
      console.error('Error finding nearby places:', error);
      return 'Error searching for nearby places. Please try again.';
    }
  }

  private handleCancelNavigation(navigationManager: NavigationManager | undefined): string {
    if (!navigationManager) {
      return 'Navigation manager not available.';
    }

    navigationManager.stopNavigation();
    return 'Navigation cancelled.';
  }

  private handleNavigationStatus(navigationManager: NavigationManager | undefined): string {
    if (!navigationManager) {
      return 'Navigation manager not available.';
    }

    return navigationManager.getNavigationStatus();
  }

  private async handleAlternativeRoute(navigationManager: NavigationManager | undefined): Promise<string> {
    if (!navigationManager) {
      return 'Navigation manager not available.';
    }

    // In a real implementation, this would calculate alternative routes
    return 'Alternative route calculation is not yet implemented. Current route is optimal.';
  }

  private async handleAddWaypoint(
    waypoint: string,
    navigationManager: NavigationManager | undefined
  ): Promise<string> {
    if (!waypoint) {
      return 'Please specify a waypoint location.';
    }

    if (!navigationManager) {
      return 'Navigation manager not available.';
    }

    const success = await navigationManager.addWaypoint(waypoint);
    if (success) {
      return `Waypoint added: ${waypoint}. Route has been updated.`;
    } else {
      return `Unable to add waypoint "${waypoint}". Please check the location and try again.`;
    }
  }

  private handleReportTraffic(
    reportType: string,
    navigationManager: NavigationManager | undefined
  ): string {
    if (!reportType) {
      return 'Please specify what you want to report (traffic, accident, hazard, road work).';
    }

    // In a real implementation, this would report to traffic services
    return `Thank you for reporting ${reportType}. Your report helps other drivers.`;
  }

  /**
   * Helper methods
   */

  private getNavigationSettings(session: AppSession): NavigationSettings {
    return {
      route_type: (session.settings.get('route_type') as 'fastest' | 'shortest' | 'avoid_highways' | 'avoid_tolls') || 'fastest',
      transportation_mode: (session.settings.get('transportation_mode') as 'driving' | 'walking' | 'cycling' | 'transit') || 'driving',
      voice_guidance: (session.settings.get('voice_guidance') as boolean) ?? true,
      voice_language: (session.settings.get('voice_language') as string) || 'en-US',
      announcement_frequency: (session.settings.get('announcement_frequency') as number) || 2,
      distance_units: (session.settings.get('distance_units') as 'metric' | 'imperial') || 'metric',
      show_speed: (session.settings.get('show_speed') as boolean) ?? true,
      show_eta: (session.settings.get('show_eta') as boolean) ?? true,
      show_distance_remaining: (session.settings.get('show_distance_remaining') as boolean) ?? true,
      location_accuracy: (session.settings.get('location_accuracy') as 'high' | 'balanced' | 'low_power') || 'high',
      save_frequent_destinations: (session.settings.get('save_frequent_destinations') as boolean) ?? true,
      speed_limit_warnings: (session.settings.get('speed_limit_warnings') as boolean) ?? true,
      traffic_alerts: (session.settings.get('traffic_alerts') as boolean) ?? true,
      hands_free_mode: (session.settings.get('hands_free_mode') as boolean) ?? true
    };
  }

  private updateNavigationSettings(session: AppSession, navigationManager: NavigationManager): void {
    const newSettings = this.getNavigationSettings(session);
    navigationManager.updateSettings(newSettings);
  }

  private setupEventHandlers(
    session: AppSession,
    navigationManager: NavigationManager,
    userId: string
  ): void {
    // Navigation events
    navigationManager.on('navigation_started', (event) => {
      console.log(`Navigation started for user ${userId}:`, event.data);
    });

    navigationManager.on('destination_reached', (event) => {
      console.log(`Destination reached for user ${userId}`);
      session.layouts.showTextWall(
        '🎯 Destination Reached!\n\nYou have arrived at your destination.',
        { durationMs: 5000 }
      );
    });

    navigationManager.on('off_route_detected', (event) => {
      console.log(`Off route detected for user ${userId}:`, event.data);
    });

    navigationManager.on('route_recalculated', (event) => {
      console.log(`Route recalculated for user ${userId}`);
    });
  }

  private async setupLocationTracking(
    session: AppSession,
    navigationManager: NavigationManager,
    userId: string
  ): Promise<void> {
    console.log(`🔧 Setting up location tracking for user ${userId}`);

    // Test location access with most basic approach - following docs exactly
    try {
      console.log('📍 Testing basic location access...');
      
      // Try the most basic location request first - lowest accuracy
      const location = await session.location.getLatestLocation({ accuracy: 'reduced' });
      
      // Now you can use the location data - following docs pattern exactly
      console.log('✅ Location access successful:', location);
      
      // Show user their current location immediately
      session.layouts.showTextWall(
        `📍 Location Found!\nLat: ${location.lat.toFixed(6)}\nLng: ${location.lng.toFixed(6)}\n\nNavigation is ready!`,
        { durationMs: 5000 }
      );

      // Set up basic location stream - following docs pattern exactly
      console.log('🔄 Starting location stream...');
      const stopLocationUpdates = session.location.subscribeToStream(
        { accuracy: 'reduced' },
        (data) => {
          // This function is your handler - following docs pattern exactly
          console.log(`New location: ${data.lat}, ${data.lng}`);
          
          // Your app logic here - pass to navigation manager
          navigationManager.onLocationUpdate({
            location: { lat: data.lat, lng: data.lng },
            speed: undefined,
            heading: undefined,
            timestamp: new Date()
          });
        }
      );

      // Store cleanup function - following docs pattern
      navigationManager.setLocationUnsubscriber(stopLocationUpdates);
      
      console.log('✅ Location tracking active for user', userId);
      
    } catch (error) {
      console.error('❌ Location access failed:', error);
      session.layouts.showTextWall(
        '⚠️ Location Not Available\n\nLocation services are not working.\nPlease check device settings and try restarting the app.',
        { durationMs: 8000 }
      );
    }
  }

  private handleTranscriptionInput(
    text: string,
    navigationManager: NavigationManager,
    session: AppSession
  ): void {
    const lowerText = text.toLowerCase();

    // Check for navigation commands that weren't caught by tool calls
    if (lowerText.includes('navigate') || lowerText.includes('directions')) {
      // Extract destination from transcription
      const destination = this.extractDestinationFromText(text);
      if (destination) {
        this.handleNavigateToDestination(destination, navigationManager, session);
      }
    } else if (lowerText.includes('stop navigation') || lowerText.includes('cancel')) {
      this.handleCancelNavigation(navigationManager);
    } else if (lowerText.includes('status') || lowerText.includes('eta')) {
      const status = this.handleNavigationStatus(navigationManager);
      session.layouts.showTextWall(status, { durationMs: 5000 });
    }
  }

  private extractDestinationFromText(text: string): string | null {
    // Simple extraction - in a real implementation, this would use NLP
    const patterns = [
      /navigate to (.+)/i,
      /directions to (.+)/i,
      /go to (.+)/i,
      /take me to (.+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Handle cleanup when session ends
   */
  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    console.log(`🛑 Navigation session stopped for user ${userId}: ${reason}`);
    
    // Clean up navigation manager
    const navigationManager = this.userNavigationManagers.get(userId);
    if (navigationManager) {
      navigationManager.stopNavigation();
    }

    // Remove references
    this.userSessions.delete(userId);
    this.userNavigationManagers.delete(userId);
  }
}

// Start the navigation app
const app = new NavigationApp();

app.start().then(() => {
  console.log('🧭 MentraOS Navigation App started successfully!');
  console.log(`📡 Server running on port ${PORT}`);
  console.log('🎯 Ready for voice commands!');
}).catch(error => {
  console.error('❌ Failed to start Navigation App:', error);
  process.exit(1);
}); 