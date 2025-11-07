# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Swift iOS/macOS application project using Xcode with SwiftUI. The project follows standard Apple development conventions with a minimal starter template structure.

## Build and Development Commands

### Building the Project
```bash
# Build the project
xcodebuild -project Shakir-ClaudeCode.xcodeproj -scheme Shakir-ClaudeCode -configuration Debug build

# Build for release
xcodebuild -project Shakir-ClaudeCode.xcodeproj -scheme Shakir-ClaudeCode -configuration Release build

# Clean build folder
xcodebuild -project Shakir-ClaudeCode.xcodeproj -scheme Shakir-ClaudeCode clean
```

### Running Tests
```bash
# Run unit tests
xcodebuild test -project Shakir-ClaudeCode.xcodeproj -scheme Shakir-ClaudeCode -destination 'platform=iOS Simulator,name=iPhone 15'

# Run UI tests specifically
xcodebuild test -project Shakir-ClaudeCode.xcodeproj -scheme Shakir-ClaudeCode -destination 'platform=iOS Simulator,name=iPhone 15' -only-testing:Shakir-ClaudeCodeUITests

# Run unit tests only
xcodebuild test -project Shakir-ClaudeCode.xcodeproj -scheme Shakir-ClaudeCode -destination 'platform=iOS Simulator,name=iPhone 15' -only-testing:Shakir-ClaudeCodeTests
```

## Architecture

### Project Structure
- `Shakir-ClaudeCode/` - Main application source code
  - `Shakir_ClaudeCodeApp.swift` - App entry point using `@main` and SwiftUI App protocol
  - `ContentView.swift` - Main view containing basic SwiftUI implementation
  - `Assets.xcassets/` - Asset catalog for images, colors, and other resources
  - `Shakir_ClaudeCode.entitlements` - App sandbox entitlements for macOS compatibility

### Testing Structure
- `Shakir-ClaudeCodeTests/` - Unit tests using Swift Testing framework
- `Shakir-ClaudeCodeUITests/` - UI tests using XCTest framework

### Key Architectural Patterns
- **SwiftUI App Structure**: Uses the modern SwiftUI App lifecycle with `@main` attribute
- **View Architecture**: Currently implements a simple view hierarchy with `ContentView` as the root
- **Testing Strategy**: Dual testing approach with both unit tests (Swift Testing) and UI tests (XCTest)
- **Sandboxing**: App is sandboxed with read-only file access permissions

### Development Notes
- The project uses Xcode's new file system synchronized groups for better project organization
- Testing framework: Swift Testing for unit tests, XCTest for UI tests
- SwiftUI previews are enabled for rapid development iteration
- The app is configured for both iOS and macOS deployment with appropriate entitlements

## Xcode Project Configuration
- **Project Format**: Xcode project with `.xcodeproj` format
- **Deployment Target**: iOS and macOS (based on entitlements)
- **Build System**: Xcode's default build system
- **Code Signing**: Standard iOS/macOS app signing requirements apply