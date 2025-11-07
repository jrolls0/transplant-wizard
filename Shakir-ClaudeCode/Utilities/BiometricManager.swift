//
//  BiometricManager.swift
//  Transplant Platform - Patient Mobile App
//
//  Biometric authentication manager for secure access
//

import LocalAuthentication
import Foundation

class BiometricManager {
    static let shared = BiometricManager()
    
    private init() {}
    
    // MARK: - Properties
    
    var isAvailable: Bool {
        let context = LAContext()
        var error: NSError?
        return context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    }
    
    var biometricType: BiometricType {
        let context = LAContext()
        var error: NSError?
        
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return .none
        }
        
        switch context.biometryType {
        case .faceID:
            return .faceID
        case .touchID:
            return .touchID
        case .opticID:
            return .opticID
        @unknown default:
            return .none
        }
    }
    
    // MARK: - Authentication
    
    func authenticate(reason: String) async -> Bool {
        let context = LAContext()
        var error: NSError?
        
        // Check if biometric authentication is available
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            print("Biometric authentication not available: \(error?.localizedDescription ?? "Unknown error")")
            return false
        }
        
        do {
            let result = try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            )
            return result
        } catch {
            print("Biometric authentication failed: \(error.localizedDescription)")
            return false
        }
    }
    
    func authenticateWithPasscode(reason: String) async -> Bool {
        let context = LAContext()
        var error: NSError?
        
        // Check if device passcode authentication is available
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            print("Device authentication not available: \(error?.localizedDescription ?? "Unknown error")")
            return false
        }
        
        do {
            let result = try await context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: reason
            )
            return result
        } catch {
            print("Device authentication failed: \(error.localizedDescription)")
            return false
        }
    }
    
    // MARK: - Settings
    
    func enableBiometricLogin(for email: String, password: String) async -> Bool {
        let success = await authenticate(reason: "Enable biometric login for your account")
        
        if success {
            // Save credentials securely
            KeychainManager.shared.saveCredentials(email: email, password: password)
            UserDefaults.standard.set(true, forKey: "biometric_login_enabled")
            UserDefaults.standard.set(email, forKey: "biometric_login_email")
            return true
        }
        
        return false
    }
    
    func disableBiometricLogin() {
        if let email = UserDefaults.standard.string(forKey: "biometric_login_email") {
            KeychainManager.shared.deleteSavedCredentials(for: email)
        }
        
        UserDefaults.standard.removeObject(forKey: "biometric_login_enabled")
        UserDefaults.standard.removeObject(forKey: "biometric_login_email")
    }
    
    var isBiometricLoginEnabled: Bool {
        return UserDefaults.standard.bool(forKey: "biometric_login_enabled")
    }
    
    var biometricLoginEmail: String? {
        return UserDefaults.standard.string(forKey: "biometric_login_email")
    }
}

// MARK: - Supporting Types

enum BiometricType {
    case none
    case touchID
    case faceID
    case opticID
    
    var displayName: String {
        switch self {
        case .none:
            return "None"
        case .touchID:
            return "Touch ID"
        case .faceID:
            return "Face ID"
        case .opticID:
            return "Optic ID"
        }
    }
    
    var icon: String {
        switch self {
        case .none:
            return "person.fill"
        case .touchID:
            return "touchid"
        case .faceID:
            return "faceid"
        case .opticID:
            return "opticid"
        }
    }
}