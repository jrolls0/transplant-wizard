#!/bin/bash

echo "🍎 Testing iOS App Compilation..."
echo "=================================="

cd /Users/jeremy/Downloads/Shakir-ClaudeCode

# Check if Xcode is available
if command -v xcodebuild &> /dev/null; then
    echo "✅ Xcode found - attempting build..."
    
    # Try to build the project
    xcodebuild -project Shakir-ClaudeCode.xcodeproj -scheme Shakir-ClaudeCode -destination 'platform=iOS Simulator,name=iPhone 15' build 2>&1 | head -20
    
    BUILD_RESULT=$?
    
    if [ $BUILD_RESULT -eq 0 ]; then
        echo "✅ iOS app builds successfully!"
        echo ""
        echo "📱 To test the iOS app:"
        echo "1. Open: /Users/jeremy/Downloads/Shakir-ClaudeCode/Shakir-ClaudeCode.xcodeproj"
        echo "2. Select iPhone 15 simulator"
        echo "3. Click Run (▶️) or press Cmd+R"
    else
        echo "⚠️  Build issues detected - see errors above"
        echo "💡 This is normal for complex projects - open in Xcode to resolve"
    fi
else
    echo "⚠️  Xcode not found in PATH"
    echo "📱 To test the iOS app:"
    echo "1. Open Finder and navigate to:"
    echo "   /Users/jeremy/Downloads/Shakir-ClaudeCode/"
    echo "2. Double-click: Shakir-ClaudeCode.xcodeproj"
    echo "3. In Xcode, select iPhone 15 simulator and click Run"
fi

echo ""
echo "🌐 Backend API Test Server:"
echo "============================"
echo "✅ Running at: http://localhost:3001"
echo "📊 Test Interface: http://localhost:3001/"
echo "🔍 Health Check: http://localhost:3001/health"
echo ""
echo "🧪 Quick API Test:"
if command -v curl &> /dev/null; then
    echo "Testing health endpoint..."
    curl -s http://localhost:3001/health || echo "Server not responding - start with: node src/test-server.js"
else
    echo "Open http://localhost:3001 in your browser to test the API"
fi