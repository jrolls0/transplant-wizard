//
//  AppState.swift
//  Transplant Platform - Patient Mobile App
//
//  Global app state management for HIPAA-compliant patient experience
//

import SwiftUI
import Combine

@MainActor
class AppState: ObservableObject {
    // MARK: - Published Properties
    @Published var isLoading = false
    @Published var showPrivacyOverlay = false
    @Published var currentError: AppError?
    @Published var networkStatus: NetworkStatus = .unknown
    
    // MARK: - Navigation State
    @Published var selectedTab: TabSelection = .dashboard
    @Published var navigationPath = NavigationPath()
    
    // MARK: - Patient Flow State
    @Published var onboardingCompleted = false
    @Published var profileCompleted = false
    @Published var roiSigned = false
    @Published var transplantCentersSelected = false
    
    // MARK: - Security State
    @Published var sessionActive = true
    @Published var biometricAuthEnabled = false
    
    private var cancellables = Set<AnyCancellable>()
    private let sessionTimeout: TimeInterval = 30 * 60 // 30 minutes
    private var sessionTimer: Timer?
    
    init() {
        setupNetworkMonitoring()
        setupSessionTimeout()
    }
    
    // MARK: - Public Methods
    
    func showError(_ error: AppError) {
        currentError = error
        HapticManager.shared.error()
    }
    
    func clearError() {
        currentError = nil
    }
    
    func setLoading(_ loading: Bool) {
        isLoading = loading
    }
    
    func resetSessionTimer() {
        sessionTimer?.invalidate()
        setupSessionTimeout()
    }
    
    func invalidateSession() {
        sessionActive = false
        sessionTimer?.invalidate()
    }
    
    // MARK: - Private Methods
    
    private func setupNetworkMonitoring() {
        NetworkMonitor.shared.$status
            .receive(on: DispatchQueue.main)
            .assign(to: \.networkStatus, on: self)
            .store(in: &cancellables)
    }
    
    private func setupSessionTimeout() {
        sessionTimer = Timer.scheduledTimer(withTimeInterval: sessionTimeout, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.invalidateSession()
            }
        }
    }
}

// MARK: - Supporting Types

enum TabSelection: String, CaseIterable {
    case dashboard = "dashboard"
    case profile = "profile"
    case centers = "centers"
    case help = "help"
    
    var title: String {
        switch self {
        case .dashboard: return "Dashboard"
        case .profile: return "Profile"
        case .centers: return "Centers"
        case .help: return "Help"
        }
    }
    
    var icon: String {
        switch self {
        case .dashboard: return "house.fill"
        case .profile: return "person.fill"
        case .centers: return "building.2.fill"
        case .help: return "questionmark.circle.fill"
        }
    }
}

enum NetworkStatus {
    case unknown
    case connected
    case disconnected
    case limited
    
    var description: String {
        switch self {
        case .unknown: return "Checking connection..."
        case .connected: return "Connected"
        case .disconnected: return "No internet connection"
        case .limited: return "Limited connectivity"
        }
    }
}

enum AppError: LocalizedError, Identifiable {
    case networkError(String)
    case authenticationError(String)
    case validationError(String)
    case serverError(String)
    case unknownError(String)
    
    var id: String {
        errorDescription ?? "unknown"
    }
    
    var errorDescription: String? {
        switch self {
        case .networkError(let message):
            return "Network Error: \(message)"
        case .authenticationError(let message):
            return "Authentication Error: \(message)"
        case .validationError(let message):
            return "Validation Error: \(message)"
        case .serverError(let message):
            return "Server Error: \(message)"
        case .unknownError(let message):
            return "Unexpected Error: \(message)"
        }
    }
    
    var recoverySuggestion: String? {
        switch self {
        case .networkError:
            return "Please check your internet connection and try again."
        case .authenticationError:
            return "Please log in again to continue."
        case .validationError:
            return "Please check your input and try again."
        case .serverError:
            return "Our servers are experiencing issues. Please try again later."
        case .unknownError:
            return "Please restart the app and try again."
        }
    }
}