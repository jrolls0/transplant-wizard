//
//  RootView.swift
//  Transplant Platform - Patient Mobile App
//
//  Root navigation view with HIPAA-compliant privacy protection
//

import SwiftUI

struct RootView: View {
    @EnvironmentObject private var authManager: AuthenticationManager
    @EnvironmentObject private var appState: AppState
    @State private var showSplashScreen = true
    
    var body: some View {
        ZStack {
            // Main content
            Group {
                if showSplashScreen {
                    SplashView()
                } else if authManager.isAuthenticated {
                    if authManager.currentUser?.allConsentsSigned == true {
                        MainTabView()
                    } else {
                        ConsentFlowView()
                    }
                } else {
                    AuthenticationFlow()
                }
            }
            .animation(.easeInOut(duration: 0.3), value: authManager.isAuthenticated)
            .animation(.easeInOut(duration: 0.3), value: showSplashScreen)
            
            // Privacy overlay for app switching (HIPAA compliance)
            if appState.showPrivacyOverlay {
                PrivacyOverlayView()
            }
            
            // Global loading indicator
            if appState.isLoading {
                LoadingOverlayView()
            }
            
            // Global error display
            if let error = appState.currentError {
                ErrorOverlayView(error: error) {
                    appState.clearError()
                }
            }
        }
        .onAppear {
            // Show splash screen briefly
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                showSplashScreen = false
            }
        }
        .preferredColorScheme(.light) // Force light mode for consistency
    }
}

// MARK: - Splash Screen

struct SplashView: View {
    @State private var logoScale: CGFloat = 0.5
    @State private var logoOpacity: Double = 0.0
    
    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [
                    Color(red: 0.2, green: 0.6, blue: 0.9),
                    Color(red: 0.1, green: 0.4, blue: 0.8)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
            
            VStack(spacing: 24) {
                // App logo/icon
                Image(systemName: "heart.fill")
                    .font(.system(size: 80, weight: .light))
                    .foregroundColor(.white)
                    .scaleEffect(logoScale)
                    .opacity(logoOpacity)
                
                // App name
                VStack(spacing: 8) {
                    Text("Transplant")
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                    
                    Text("Patient Portal")
                        .font(.system(size: 18, weight: .medium, design: .rounded))
                        .foregroundColor(.white.opacity(0.9))
                }
                .opacity(logoOpacity)
                
                // Loading indicator
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(1.2)
                    .opacity(logoOpacity)
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 1.0)) {
                logoScale = 1.0
                logoOpacity = 1.0
            }
        }
    }
}

// MARK: - Privacy Overlay

struct PrivacyOverlayView: View {
    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()
            
            VStack(spacing: 16) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 64))
                    .foregroundColor(.white)
                
                Text("Protected Content")
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                
                Text("Your health information is protected")
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.8))
                    .multilineTextAlignment(.center)
            }
        }
    }
}

// MARK: - Loading Overlay

struct LoadingOverlayView: View {
    var body: some View {
        ZStack {
            Color.black.opacity(0.4)
                .ignoresSafeArea()
            
            VStack(spacing: 16) {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(1.5)
                
                Text("Loading...")
                    .font(.headline)
                    .foregroundColor(.white)
            }
            .padding(32)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(.ultraThinMaterial)
            )
        }
    }
}

// MARK: - Error Overlay

struct ErrorOverlayView: View {
    let error: AppError
    let onDismiss: () -> Void
    
    var body: some View {
        ZStack {
            Color.black.opacity(0.4)
                .ignoresSafeArea()
                .onTapGesture {
                    onDismiss()
                }
            
            VStack(spacing: 20) {
                // Error icon
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 48))
                    .foregroundColor(.red)
                
                // Error details
                VStack(spacing: 12) {
                    Text("Error")
                        .font(.title2)
                        .fontWeight(.bold)
                    
                    Text(error.errorDescription ?? "An unexpected error occurred")
                        .font(.body)
                        .multilineTextAlignment(.center)
                        .foregroundColor(.secondary)
                    
                    if let suggestion = error.recoverySuggestion {
                        Text(suggestion)
                            .font(.caption)
                            .multilineTextAlignment(.center)
                            .foregroundColor(.secondary)
                    }
                }
                
                // Dismiss button
                Button("OK") {
                    onDismiss()
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(24)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(.regularMaterial)
            )
            .padding(.horizontal, 32)
        }
    }
}

#Preview {
    RootView()
        .environmentObject(AuthenticationManager())
        .environmentObject(AppState())
}