//
//  AuthenticationManager.swift
//  Transplant Platform - Patient Mobile App
//
//  AWS Cognito authentication manager for HIPAA-compliant patient access
//

import SwiftUI
import Combine
import CryptoKit

@MainActor
class AuthenticationManager: ObservableObject {
    // MARK: - Published Properties
    @Published var isAuthenticated = false
    @Published var isLoading = false
    @Published var currentUser: PatientUser?
    @Published var authError: String?
    
    // MARK: - Private Properties
    private let apiService = APIService.shared
    private let keychainManager = KeychainManager.shared
    private var cancellables = Set<AnyCancellable>()
    
    // AWS Cognito configuration
    private let cognitoConfig = CognitoConfig(
        userPoolId: "us-east-1_G8KcsbQN9",
        clientId: "77237jqj5neec39d2nr1bnauis",
        region: "us-east-1"
    )
    
    init() {
        checkAuthenticationStatus()
    }
    
    // MARK: - Public Methods
    
    func checkAuthenticationStatus() {
        // Check for stored authentication tokens
        if let accessToken = keychainManager.getAccessToken(),
           let refreshToken = keychainManager.getRefreshToken() {
            // Validate token and get user info
            Task {
                await validateTokenAndGetUser(accessToken: accessToken)
            }
        }
    }
    
    func signUp(email: String, password: String, profile: PatientRegistrationData) async -> Bool {
        isLoading = true
        authError = nil
        
        do {
            // Validate input
            try validateRegistrationData(email: email, password: password, profile: profile)
            
            // Call registration API
            let response = try await apiService.registerPatient(
                email: email,
                password: password,
                profile: profile
            )
            
            // With basic authentication, registration is complete
            // No email verification needed - user can now log in
            isLoading = false
            return true
            
        } catch {
            isLoading = false
            authError = handleAuthError(error)
            return false
        }
    }
    
    func verifyEmail(email: String, code: String) async -> Bool {
        isLoading = true
        authError = nil
        
        do {
            let response = try await apiService.verifyEmail(email: email, code: code)
            
            // After successful verification, automatically log the user in
            // In a real app, the server would return tokens after verification
            // For testing, we'll simulate successful login
            
            // Create a mock user for testing
            let mockUser = PatientUser(
                id: "test_user_\(Date().timeIntervalSince1970)",
                email: email,
                firstName: "Test",
                lastName: "User", 
                profileCompleted: false,
                onboardingCompleted: false,
                roiSigned: false,
                transplantCentersSelected: false,
                dialysisClinicId: nil,
                assignedSocialWorkerName: nil,
                createdAt: Date()
            )
            
            // Store mock tokens (in real app, these would come from server)
            keychainManager.storeAccessToken("mock_access_token_\(Date().timeIntervalSince1970)")
            keychainManager.storeRefreshToken("mock_refresh_token_\(Date().timeIntervalSince1970)")
            keychainManager.storeUserID(mockUser.id)
            
            // Set authentication state
            isAuthenticated = true
            currentUser = mockUser
            
            // Clear pending verification
            UserDefaults.standard.removeObject(forKey: "pending_verification_email")
            
            // Log successful authentication
            AuditLogger.shared.logAuthentication(
                userId: mockUser.id,
                action: .login,
                success: true
            )
            
            isLoading = false
            return true
            
        } catch {
            isLoading = false
            authError = handleAuthError(error)
            return false
        }
    }
    
    func signIn(email: String, password: String) async -> Bool {
        isLoading = true
        authError = nil
        
        do {
            // Call login API
            let response = try await apiService.loginPatient(email: email, password: password)
            
            // Store tokens securely
            keychainManager.storeAccessToken(response.data.accessToken)
            keychainManager.storeRefreshToken(response.data.refreshToken)
            keychainManager.storeUserID(response.data.user.id)
            
            // Update authentication state
            isAuthenticated = true
            currentUser = response.data.user
            
            // Log successful authentication
            AuditLogger.shared.logAuthentication(
                userId: response.data.user.id,
                action: .login,
                success: true
            )
            
            isLoading = false
            return true
            
        } catch {
            isLoading = false
            print("❌ Login failed with error: \(error)")
            print("❌ Error description: \(error.localizedDescription)")
            print("❌ Error type: \(type(of: error))")
            if let decodingError = error as? DecodingError {
                print("❌ Decoding Error Details:")
                switch decodingError {
                case .dataCorrupted(let context):
                    print("  - Data corrupted: \(context)")
                case .keyNotFound(let key, let context):
                    print("  - Key not found: \(key) in context: \(context)")
                case .typeMismatch(let type, let context):
                    print("  - Type mismatch: \(type) in context: \(context)")
                case .valueNotFound(let type, let context):
                    print("  - Value not found: \(type) in context: \(context)")
                @unknown default:
                    print("  - Unknown decoding error")
                }
            }
            if let apiError = error as? APIError {
                print("❌ API Error: \(apiError)")
            }
            authError = handleAuthError(error)
            
            // Log failed authentication attempt
            AuditLogger.shared.logAuthentication(
                userId: nil,
                action: .loginAttempt,
                success: false,
                error: error.localizedDescription
            )
            
            return false
        }
    }
    
    func signOut() async {
        // Clear stored tokens
        keychainManager.clearAllTokens()
        
        // Log logout
        if let userId = currentUser?.id {
            AuditLogger.shared.logAuthentication(
                userId: userId,
                action: .logout,
                success: true
            )
        }
        
        // Reset authentication state
        isAuthenticated = false
        currentUser = nil
        authError = nil
    }
    
    func refreshAuthToken() async -> Bool {
        guard let refreshToken = keychainManager.getRefreshToken() else {
            await signOut()
            return false
        }
        
        do {
            let response = try await apiService.refreshToken(refreshToken: refreshToken)
            
            // Update stored tokens
            keychainManager.storeAccessToken(response.accessToken)
            if let newRefreshToken = response.refreshToken {
                keychainManager.storeRefreshToken(newRefreshToken)
            }
            
            return true
            
        } catch {
            // Refresh failed, sign out user
            await signOut()
            return false
        }
    }
    
    func resetPassword(email: String) async -> Bool {
        isLoading = true
        authError = nil
        
        do {
            try await apiService.requestPasswordReset(email: email)
            isLoading = false
            return true
            
        } catch {
            isLoading = false
            authError = handleAuthError(error)
            return false
        }
    }
    
    func confirmPasswordReset(email: String, code: String, newPassword: String) async -> Bool {
        isLoading = true
        authError = nil
        
        do {
            try await apiService.confirmPasswordReset(
                email: email,
                code: code,
                newPassword: newPassword
            )
            isLoading = false
            return true
            
        } catch {
            isLoading = false
            authError = handleAuthError(error)
            return false
        }
    }
    
    func signROIConsent(digitalSignature: String) async -> Bool {
        guard let accessToken = keychainManager.getAccessToken() else {
            authError = "Authentication required"
            return false
        }
        
        isLoading = true
        authError = nil
        
        do {
            // Call the real API to store ROI consent
            let _ = try await apiService.signROIConsent(
                digitalSignature: digitalSignature,
                accessToken: accessToken
            )
            
            // Update current user's ROI status
            if var user = currentUser {
                // Create updated user with ROI signed
                currentUser = PatientUser(
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    profileCompleted: user.profileCompleted,
                    onboardingCompleted: user.onboardingCompleted,
                    roiSigned: true,
                    transplantCentersSelected: user.transplantCentersSelected,
                    dialysisClinicId: user.dialysisClinicId,
                    assignedSocialWorkerName: user.assignedSocialWorkerName,
                    createdAt: user.createdAt
                )
                
                // Log ROI signature for audit trail
                AuditLogger.shared.logROISignature(
                    userId: user.id,
                    digitalSignature: digitalSignature,
                    success: true
                )
                
                print("✅ ROI Consent signed successfully for user: \(user.email)")
            }
            
            isLoading = false
            return true
            
        } catch {
            isLoading = false
            authError = handleAuthError(error)
            print("❌ Failed to sign ROI consent: \(error)")
            return false
        }
    }
    
    // MARK: - Private Methods
    
    private func validateTokenAndGetUser(accessToken: String) async {
        do {
            let user = try await apiService.getCurrentUser(accessToken: accessToken)
            
            isAuthenticated = true
            currentUser = user
            
        } catch {
            // Token invalid, clear authentication
            await signOut()
        }
    }
    
    private func validateRegistrationData(email: String, password: String, profile: PatientRegistrationData) throws {
        // Email validation
        guard isValidEmail(email) else {
            throw AuthError.invalidEmail
        }
        
        // Password validation
        guard isValidPassword(password) else {
            throw AuthError.weakPassword
        }
        
        // Required fields validation
        guard !profile.firstName.isEmpty,
              !profile.lastName.isEmpty else {
            throw AuthError.missingRequiredFields
        }
    }
    
    private func isValidEmail(_ email: String) -> Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        return NSPredicate(format: "SELF MATCHES %@", emailRegex).evaluate(with: email)
    }
    
    private func isValidPassword(_ password: String) -> Bool {
        // AWS Cognito password requirements
        let hasMinLength = password.count >= 8
        let hasUppercase = password.rangeOfCharacter(from: .uppercaseLetters) != nil
        let hasLowercase = password.rangeOfCharacter(from: .lowercaseLetters) != nil
        let hasNumber = password.rangeOfCharacter(from: .decimalDigits) != nil
        let hasSymbol = password.rangeOfCharacter(from: CharacterSet(charactersIn: "!@#$%^&*()_+-=[]{}|;:,.<>?")) != nil
        
        return hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSymbol
    }
    
    private func handleAuthError(_ error: Error) -> String {
        if let apiError = error as? APIError {
            switch apiError {
            case .unauthorized:
                return "Invalid email or password"
            case .validationError(let message):
                return message
            case .serverError:
                return "Server error. Please try again later."
            case .networkError:
                return "Network error. Please check your connection."
            }
        }
        
        return error.localizedDescription
    }
}

// MARK: - Supporting Types

struct CognitoConfig {
    let userPoolId: String
    let clientId: String
    let region: String
}

enum AuthError: LocalizedError {
    case invalidEmail
    case weakPassword
    case missingRequiredFields
    case userNotFound
    case userAlreadyExists
    case invalidVerificationCode
    
    var errorDescription: String? {
        switch self {
        case .invalidEmail:
            return "Please enter a valid email address"
        case .weakPassword:
            return "Password must be at least 8 characters with uppercase, lowercase, number, and symbol"
        case .missingRequiredFields:
            return "Please fill in all required fields"
        case .userNotFound:
            return "User not found"
        case .userAlreadyExists:
            return "An account with this email already exists"
        case .invalidVerificationCode:
            return "Invalid verification code"
        }
    }
}

struct PatientUser: Codable, Identifiable {
    let id: String
    let email: String
    let firstName: String
    let lastName: String
    let profileCompleted: Bool
    let onboardingCompleted: Bool
    let roiSigned: Bool
    let transplantCentersSelected: Bool
    let dialysisClinicId: String?
    let assignedSocialWorkerName: String?
    let createdAt: Date
    
    var fullName: String {
        "\(firstName) \(lastName)"
    }
}

struct PatientRegistrationData {
    let title: String?
    let firstName: String
    let lastName: String
    let phoneNumber: String?
    let dateOfBirth: Date?
    let address: String?
    let primaryCarePhysician: String?
    let insuranceProvider: String?
    let nephrologist: String?
    let dialysisClinic: String
    let socialWorkerName: String
    let referralToken: String?
}