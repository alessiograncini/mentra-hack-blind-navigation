# G(eo)1 - AI-Enhanced Navigation for Smart Glasses

> **G(eo)1** is a play on the G1 glasses but with advanced navigation features, powered by AI and computer vision.

G(eo)1 is a sophisticated navigation system designed specifically for smart glasses, combining real-time GPS navigation with AI-powered environmental analysis and store sign detection. Built on the MentraOS platform, it provides turn-by-turn directions enhanced with contextual awareness of the user's surroundings.

## 🌟 Features

- **🧭 Real-time Navigation**: Turn-by-turn directions with voice guidance
- **🤖 AI Scene Analysis**: Powered by Google Gemini AI for environmental context
- **🏪 Store Sign Detection**: Roboflow-powered computer vision for retail awareness
- **📍 Multi-Provider Mapping**: OpenRouteService, Mapbox, and fallback demo routes
- **🎙️ Voice Control**: Natural voice commands for hands-free operation
- **📱 Smart Glasses Display**: Optimized interface for MentraOS smart glasses
- **🔄 Real-time Updates**: Live location tracking and dynamic route recalculation
- **🎯 Contextual Awareness**: Enhanced navigation with environmental understanding

## 🏗️ System Architecture

### High-Level System Overview

```mermaid
graph TD
    A["Smart Glasses User"] --> B["MentraOS SDK"]
    B --> C["G(eo)1 Navigation App"]
    
    C --> D["Navigation Manager"]
    C --> E["Street View Service"]
    C --> F["Mapping Service"]
    C --> G["Gemini AI Service"]
    
    D --> H["Location Tracking"]
    D --> I["Route Processing"]
    D --> J["Voice Guidance"]
    
    E --> K["Google Street View API"]
    
    F --> L["OpenRouteService"]
    F --> M["Mapbox API"]
    F --> N["Nominatim/OSM"]
    
    G --> O["Google Gemini AI"]
    G --> P["Roboflow Store Detection"]
    
    K --> Q["Street View Images"]
    Q --> P
    P --> R["Store Sign Detection"]
    Q --> O
    O --> S["AI Scene Analysis"]
    
    R --> T["Enhanced Context"]
    S --> T
    T --> U["Real-time Navigation Display"]
    
    H --> V["GPS/Location Services"]
    I --> W["Turn-by-turn Instructions"]
    J --> X["Voice Announcements"]
    
    U --> Y["Smart Glasses Display"]
    X --> Z["Audio Output"]
    
    style A fill:#e1f5fe
    style C fill:#f3e5f5
    style D fill:#e8f5e8
    style E fill:#fff3e0
    style F fill:#fff3e0
    style G fill:#f1f8e9
```

### Component Architecture

```mermaid
graph LR
    subgraph "User Interface Layer"
        A["Voice Commands"]
        B["Smart Glasses Display"]
        C["Audio Feedback"]
    end
    
    subgraph "MentraOS SDK Layer"
        D["AppServer"]
        E["AppSession"]
        F["Location Services"]
        G["Layout Manager"]
        H["Settings Manager"]
    end
    
    subgraph "Navigation Core"
        I["NavigationManager"]
        J["NavigationState"]
        K["NavigationInstruction"]
        L["RouteStep"]
    end
    
    subgraph "Service Layer"
        M["MappingService"]
        N["StreetViewService"]
        O["GeminiService"]
    end
    
    subgraph "Utility Layer"
        P["Distance Utils"]
        Q["Instruction Utils"]
        R["Navigation Types"]
    end
    
    subgraph "External APIs"
        S["Google Street View API"]
        T["Google Gemini API"]
        U["Roboflow API"]
        V["OpenRouteService"]
        W["Mapbox API"]
        X["Nominatim API"]
    end
    
    A --> D
    D --> E
    E --> I
    I --> J
    I --> K
    I --> L
    
    I --> M
    I --> N
    I --> O
    
    M --> V
    M --> W
    M --> X
    
    N --> S
    O --> T
    O --> U
    
    I --> P
    I --> Q
    I --> R
    
    E --> F
    E --> G
    E --> H
    
    B --> G
    C --> G
    
    J --> B
    J --> C
    
    style I fill:#ffcdd2
    style M fill:#c8e6c9
    style N fill:#ffe0b2
    style O fill:#d1c4e9
```

### Data Flow Architecture

```mermaid
graph TD
    subgraph "Input Data"
        A["Voice Commands"]
        B["GPS Location"]
        C["User Settings"]
    end
    
    subgraph "Processing Layer"
        D["Navigation Manager"]
        E["Route Calculation"]
        F["Street View Processing"]
        G["AI Analysis"]
        H["Store Sign Detection"]
    end
    
    subgraph "External Data Sources"
        I["Google Street View API"]
        J["Google Gemini AI"]
        K["Roboflow API"]
        L["Mapping APIs"]
    end
    
    subgraph "Output Data"
        M["Navigation Instructions"]
        N["Directional Arrows"]
        O["AI Context"]
        P["Voice Announcements"]
        Q["Visual Display"]
    end
    
    A --> D
    B --> D
    C --> D
    
    D --> E
    E --> L
    L --> E
    
    D --> F
    F --> I
    I --> F
    
    F --> G
    G --> J
    J --> G
    
    F --> H
    H --> K
    K --> H
    
    E --> M
    B --> N
    G --> O
    H --> O
    
    M --> P
    M --> Q
    N --> Q
    O --> Q
    
    style D fill:#ffcdd2
    style E fill:#c8e6c9
    style F fill:#ffe0b2
    style G fill:#d1c4e9
    style H fill:#fff3e0
```

## 🔄 Navigation Flow

The following sequence diagram illustrates the complete navigation process:

```mermaid
sequenceDiagram
    participant User as Smart Glasses User
    participant App as G(eo)1 App
    participant Nav as NavigationManager
    participant Street as StreetViewService
    participant Gemini as GeminiService
    participant Robo as Roboflow
    participant Maps as MappingService
    participant Glass as Smart Glasses
    
    User->>App: "Navigate to [destination]"
    App->>Nav: startNavigation(destination)
    Nav->>Maps: calculateRoute(origin, destination)
    Maps->>Nav: NavigationRoute
    Nav->>Street: fetchStreetViewImage(currentLocation)
    Street->>Nav: imagePath
    Nav->>Robo: detectStoreSigns(imagePath)
    Robo->>Nav: StoreSignDetection
    Nav->>Gemini: analyzeStreetViewImage(imagePath, storeSignDetection)
    Gemini->>Nav: AIAnalysis
    Nav->>Glass: updateNavigationDisplay(instructions + AI context)
    
    loop Every 1 second
        Nav->>Glass: updateLocationTracking()
        Glass->>Nav: locationUpdate
        Nav->>Glass: updateDirectionalArrow()
    end
    
    loop Every 20 seconds
        Nav->>Street: fetchStreetViewImage(currentLocation)
        Street->>Nav: newImagePath
        Nav->>Robo: detectStoreSigns(newImagePath)
        Robo->>Nav: updatedStoreSignDetection
        Nav->>Gemini: analyzeStreetViewImage(newImagePath, updatedStoreSignDetection)
        Gemini->>Nav: updatedAIAnalysis
        Nav->>Glass: updateNavigationDisplay(updated context)
    end
    
    Nav->>Glass: "You have arrived at your destination"
    User->>App: "Restart session"
    App->>Nav: restartSession()
    Nav->>Glass: "Session restarted"
```

## 🛠️ Technical Architecture

### Core Classes

```mermaid
classDiagram
    class NavigationApp {
        +mappingService: MappingService
        +userNavigationManagers: Map
        +userSessions: Map
        +onToolCall(toolCall): Promise~string~
        +onSession(session, sessionId, userId): Promise~void~
        +handleNavigateToDestination(): Promise~string~
        +handleFindNearbyPlaces(): Promise~string~
    }
    
    class NavigationManager {
        +session: AppSession
        +mappingService: MappingService
        +streetViewService: StreetViewService
        +geminiService: GeminiService
        +navigationState: NavigationState
        +startNavigation(destination): Promise~boolean~
        +stopNavigation(): void
        +onLocationUpdate(update): void
        +updateNavigationDisplay(): void
    }
    
    class MappingService {
        +orsApiKey: string
        +mapboxApiKey: string
        +calculateRoute(request): Promise~NavigationRoute~
        +searchPlaces(query, location): Promise~PlaceSearchResult[]~
        +geocode(address): Promise~GeocodeResult[]~
        +generateInstructions(route): NavigationInstruction[]
    }
    
    class StreetViewService {
        +apiKey: string
        +fetchStreetViewImage(location): Promise~string~
        +cropGoogleWatermark(imagePath): Promise~string~
    }
    
    class GeminiService {
        +apiKey: string
        +roboflowApiKey: string
        +detectStoreSigns(imagePath): Promise~StoreSignDetection~
        +analyzeStreetViewImage(imagePath): Promise~string~
        +createLabeledImage(imagePath, predictions): Promise~void~
    }
    
    class NavigationState {
        +isNavigating: boolean
        +sessionLocked: boolean
        +currentRoute: NavigationRoute
        +currentLocation: Coordinates
        +currentInstruction: NavigationInstruction
    }
    
    class NavigationRoute {
        +id: string
        +startLocation: RoutePoint
        +endLocation: RoutePoint
        +distance: DistanceValue
        +duration: DurationValue
        +legs: RouteLeg[]
    }
    
    class NavigationInstruction {
        +id: string
        +distance: number
        +instruction: string
        +maneuver: string
        +streetName: string
        +direction: string
    }
    
    NavigationApp --> NavigationManager
    NavigationManager --> MappingService
    NavigationManager --> StreetViewService
    NavigationManager --> GeminiService
    NavigationManager --> NavigationState
    NavigationState --> NavigationRoute
    NavigationState --> NavigationInstruction
    MappingService --> NavigationRoute
    MappingService --> NavigationInstruction
```

## 🚀 Technology Stack

### Core Platform
- **[MentraOS SDK](https://mentra.glass)** - Smart glasses platform and hardware abstraction
- **Node.js** - Runtime environment
- **TypeScript** - Programming language

### AI & Computer Vision
- **[Google Gemini AI](https://ai.google.dev/gemini-api)** - Advanced AI for scene analysis and contextual understanding
- **[Roboflow](https://roboflow.com/)** - Computer vision platform for store sign detection
- **Canvas API** - Image processing and manipulation

### Mapping & Navigation
- **[Google Street View Static API](https://developers.google.com/maps/documentation/streetview)** - Street-level imagery
- **[OpenRouteService](https://openrouteservice.org/)** - Primary routing service
- **[Mapbox Directions API](https://docs.mapbox.com/api/navigation/)** - Enhanced routing with turn-by-turn instructions
- **[Nominatim](https://nominatim.openstreetmap.org/)** - Geocoding and place search

### Key Dependencies
```json
{
  "@mentra/sdk": "^2.0.3",
  "axios": "^1.6.0",
  "canvas": "^3.1.2",
  "dotenv": "^17.2.0",
  "express": "^4.18.2"
}
```

## 🎯 Key Features Deep Dive

### 1. AI-Enhanced Navigation
- **Scene Analysis**: Gemini AI analyzes street view images to provide contextual information
- **Store Detection**: Roboflow computer vision identifies and labels store signs
- **Contextual Awareness**: Combines navigation with environmental understanding

### 2. Multi-Provider Route Calculation
- **Primary**: OpenRouteService for free, reliable routing
- **Enhanced**: Mapbox for detailed turn-by-turn instructions
- **Fallback**: Demo routes when APIs are unavailable

### 3. Smart Glasses Optimization
- **Real-time Updates**: 1-second location tracking for responsive navigation
- **Voice Control**: Natural language commands for hands-free operation
- **Optimized Display**: Designed for small screen smart glasses interface

### 4. Advanced Location Services
- **Precision Tracking**: Uses MentraOS location services with multiple accuracy levels
- **Directional Arrows**: Real-time compass-based direction indicators
- **Off-route Detection**: Automatic route recalculation when deviating

## 🔧 Project Structure

```
src/
├── index.ts                 # Main application entry point
├── services/
│   ├── navigationManager.ts # Core navigation logic and state management
│   ├── mappingService.ts    # Route calculation and mapping APIs
│   ├── streetViewService.ts # Google Street View integration
│   └── geminiService.ts     # AI analysis and store sign detection
├── types/
│   └── navigation.ts        # TypeScript type definitions
└── utils/
    ├── distance.ts          # Distance calculations and utilities
    └── instructions.ts      # Navigation instruction processing
```

## 📱 Usage Examples

### Voice Commands
- **"Navigate to Starbucks"** - Find and navigate to nearest location
- **"Navigate to 123 Main Street"** - Navigate to specific address
- **"Find nearby gas stations"** - Search for places around current location
- **"Navigation status"** - Get current navigation information
- **"Cancel navigation"** - Stop current navigation
- **"Restart session"** - Reset for new navigation

### API Integration
```typescript
// Initialize navigation to a destination
const success = await navigationManager.startNavigation("Central Park");

// Get AI analysis of current surroundings
const context = await geminiService.analyzeStreetViewImage(imagePath, location);

// Detect store signs in street view
const detection = await geminiService.detectStoreSigns(imagePath, location);
```

## 🔐 Environment Configuration

Required environment variables:
```env
MENTRAOS_API_KEY=your_mentraos_api_key
GOOGLE_API_KEY=your_google_streetview_api_key
GOOGLE_GEMINI_API_KEY=your_gemini_api_key
ROBOFLOW_API_KEY=your_roboflow_api_key
OPENROUTESERVICE_API_KEY=your_ors_api_key
MAPBOX_API_KEY=your_mapbox_api_key
PACKAGE_NAME=your_package_name
PORT=3000
```

## 🚀 Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-repo/mentra-hack-blind-navigation.git
   cd mentra-hack-blind-navigation
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Start the application**
   ```bash
   npm start
   ```

## 🎨 Innovation Highlights

### AI-Powered Context Awareness
G(eo)1 goes beyond traditional navigation by providing intelligent context about your surroundings:
- **Environmental Analysis**: Understands the type of area (commercial, residential, etc.)
- **Store Sign Recognition**: Identifies and reports nearby businesses
- **Contextual Descriptions**: Provides relevant landmarks and navigation aids

### Advanced Computer Vision Pipeline
- **Street View Processing**: Automatically fetches and processes street-level imagery
- **Watermark Removal**: Intelligent cropping to remove Google branding
- **Real-time Detection**: Continuous monitoring of store signs and landmarks
- **Labeled Output**: Generates annotated images with detection results

### Smart Glasses Integration
- **Voice-First Design**: Optimized for hands-free operation
- **Minimal UI**: Clean, focused interface for small displays
- **Real-time Updates**: Responsive navigation with live location tracking
- **Contextual Display**: Shows navigation instructions alongside AI insights

## 📊 Performance Features

- **Real-time Location Tracking**: 1-second update intervals for responsive navigation
- **AI Context Updates**: 20-second intervals for environmental analysis
- **Efficient Route Calculation**: Multi-provider fallback system
- **Optimized Display Updates**: Smooth directional arrow updates
- **Memory Management**: Efficient handling of navigation state and user sessions

## 🔮 Future Enhancements

- **Offline Navigation**: Cached maps and routes for areas without connectivity
- **Enhanced AI Models**: More sophisticated scene understanding and object detection
- **Social Features**: Share routes and points of interest with other users
- **Accessibility Features**: Enhanced support for users with visual impairments
- **Multi-language Support**: Localized voice guidance and interface

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

We welcome contributions to G(eo)1! Please read our contributing guidelines and submit pull requests for any improvements.

---

**G(eo)1** - Where navigation meets intelligence. Built with ❤️ for the future of smart glasses.