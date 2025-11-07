//
//  Shakir_ClaudeCodeApp.swift
//  Transplant Platform - Patient Mobile App
//
//  HIPAA-compliant iOS app for transplant referral patients
//  Created by Jeremy A. Rolls on 7/18/25.
//

import SwiftUI

@main
struct TransplantPatientApp: App {
    @StateObject private var authManager = AuthenticationManager()
    @StateObject private var appState = AppState()
    
    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authManager)
                .environmentObject(appState)
                .onAppear {
                    setupApp()
                }
        }
    }
    
    private func setupApp() {
        // Initialize authentication state
        authManager.checkAuthenticationStatus()
        
        // Configure app for HIPAA compliance
        configureHIPAACompliance()
    }
    
    private func configureHIPAACompliance() {
        // Disable screenshots in app switcher for PHI protection
        #if !DEBUG && canImport(UIKit)
        NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil,
            queue: .main
        ) { _ in
            // Add privacy overlay
            appState.showPrivacyOverlay = true
        }
        
        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { _ in
            // Remove privacy overlay
            appState.showPrivacyOverlay = false
        }
        #endif
    }
}
