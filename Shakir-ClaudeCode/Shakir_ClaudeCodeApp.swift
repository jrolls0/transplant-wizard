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
                .onOpenURL { url in
                    handleDeepLink(url)
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

    private func handleDeepLink(_ url: URL) {
        print("🔗 Deep link received: \(url.absoluteString)")

        // Handle app://register URL scheme
        guard url.scheme == "app" else {
            print("❌ Invalid URL scheme: \(url.scheme ?? "none")")
            return
        }

        guard url.host == "register" else {
            print("❌ Unknown URL host: \(url.host ?? "none")")
            return
        }

        // Parse query parameters
        let components = URLComponents(url: url, resolvingAgainstBaseURL: true)
        var referralData: [String: String] = [:]

        if let queryItems = components?.queryItems {
            for item in queryItems {
                if let value = item.value {
                    referralData[item.name] = value
                    print("📋 Parsed parameter: \(item.name) = \(value)")
                }
            }
        }

        // Store referral data for use in registration view
        appState.referralData = referralData

        // If referral token is present, fetch full referral data
        if let referralToken = referralData["referralToken"] {
            fetchReferralData(token: referralToken)
        } else {
            print("⚠️ No referral token found in deep link")
        }

        // Navigate to registration view
        appState.deepLinkPath = .register
        print("✅ Deep link processed successfully")
    }

    private func fetchReferralData(token: String) {
        // Fetch referral pre-fill data from backend
        Task {
            do {
                let endpoint = "/api/v1/patient/referral/\(token)"
                let url = URL(string: "https://api.transplantwizard.com" + endpoint)!
                var request = URLRequest(url: url)
                request.httpMethod = "GET"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")

                let (data, response) = try await URLSession.shared.data(for: request)

                guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                    print("❌ Failed to fetch referral data")
                    return
                }

                let decoder = JSONDecoder()
                let apiResponse = try decoder.decode(ReferralDataResponse.self, from: data)

                if let referralInfo = apiResponse.data {
                    // Merge fetched data with URL parameters
                    var mergedData = appState.referralData
                    mergedData["referralToken"] = token
                    mergedData["firstName"] = referralInfo.patientFirstName
                    mergedData["lastName"] = referralInfo.patientLastName
                    mergedData["email"] = referralInfo.patientEmail
                    mergedData["title"] = referralInfo.patientTitle ?? ""
                    mergedData["nephrologist"] = referralInfo.patientNephrologist ?? ""
                    mergedData["dialysisClinic"] = referralInfo.dialysisClinic
                    mergedData["dusw"] = referralInfo.duswName

                    DispatchQueue.main.async {
                        appState.referralData = mergedData
                        print("✅ Referral data fetched successfully")
                    }
                }
            } catch {
                print("❌ Error fetching referral data: \(error.localizedDescription)")
            }
        }
    }
}

// MARK: - Supporting Models for Deep Linking

struct ReferralDataResponse: Codable {
    let success: Bool
    let data: ReferralDataInfo?
}

struct ReferralDataInfo: Codable {
    let patientTitle: String?
    let patientFirstName: String
    let patientLastName: String
    let patientEmail: String
    let patientNephrologist: String?
    let dialysisClinic: String
    let dialysisClinicId: String?
    let duswName: String
    let duswEmail: String?
    let expiresAt: String?
}
