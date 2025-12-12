//
//  APIService.swift
//  Transplant Platform - Patient Mobile App
//
//  HIPAA-compliant API service for backend communication
//

import Foundation
import Combine

class APIService: ObservableObject {
    static let shared = APIService()
    
    // MARK: - Configuration
    private let baseURL = "https://api.transplantwizard.com/api/v1"
    private let session: URLSession
    
    // MARK: - Private Properties
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        // Configure URLSession for HIPAA compliance
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        config.waitsForConnectivity = true
        config.networkServiceType = .responsiveData
        
        self.session = URLSession(configuration: config)
    }
    
    // MARK: - Authentication Endpoints
    
    func registerPatient(email: String, password: String, profile: PatientRegistrationData) async throws -> VerificationResponse {
        let endpoint = "/auth/register/patient"
        let body = PatientRegistrationRequest(
            title: profile.title,
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: email,
            phoneNumber: profile.phoneNumber,
            dateOfBirth: profile.dateOfBirth?.iso8601String,
            address: profile.address,
            primaryCarePhysician: profile.primaryCarePhysician,
            insuranceProvider: profile.insuranceProvider,
            nephrologist: profile.nephrologist,
            dialysisClinic: profile.dialysisClinic,
            socialWorkerName: profile.socialWorkerName,
            referralToken: profile.referralToken,
            password: password
        )

        return try await performRequest(endpoint: endpoint, method: .POST, body: body)
    }
    
    func verifyEmail(email: String, code: String) async throws -> VerificationResponse {
        let endpoint = "/auth/verify"
        let body = EmailVerificationRequest(email: email, code: code)
        
        return try await performRequest(endpoint: endpoint, method: .POST, body: body)
    }
    
    func loginPatient(email: String, password: String) async throws -> AuthResponse {
        let endpoint = "/auth/login"
        let body = LoginRequest(email: email, password: password, userType: "patient")
        
        return try await performRequest(endpoint: endpoint, method: .POST, body: body)
    }
    
    func refreshToken(refreshToken: String) async throws -> TokenResponse {
        let endpoint = "/auth/refresh"
        let body = RefreshTokenRequest(refreshToken: refreshToken)
        
        return try await performRequest(endpoint: endpoint, method: .POST, body: body)
    }
    
    func fetchSocialWorkers() async throws -> SocialWorkersResponse {
        // This endpoint is not under /api/v1, so we need to use the full URL
        let fullURL = "https://api.transplantwizard.com/api/social-workers"
        let url = URL(string: fullURL)!
        var request = URLRequest(url: url)
        request.httpMethod = HTTPMethod.GET.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("TransplantPatientApp/1.0", forHTTPHeaderField: "User-Agent")
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError
        }
        
        switch httpResponse.statusCode {
        case 200...299:
            let decoder = createJSONDecoder()
            return try decoder.decode(SocialWorkersResponse.self, from: data)
        case 400...499:
            throw APIError.validationError("Failed to fetch social workers")
        case 500...599:
            throw APIError.serverError
        default:
            throw APIError.networkError
        }
    }
    
    func getCurrentUser(accessToken: String) async throws -> PatientUser {
        let endpoint = "/auth/me"
        
        return try await performAuthenticatedRequest(
            endpoint: endpoint,
            method: .GET,
            body: EmptyRequest(),
            accessToken: accessToken
        )
    }
    
    func requestPasswordReset(email: String) async throws {
        let endpoint = "/auth/forgot-password"
        let body = ForgotPasswordRequest(email: email)
        
        let _: EmptyResponse = try await performRequest(endpoint: endpoint, method: .POST, body: body)
    }
    
    func confirmPasswordReset(email: String, code: String, newPassword: String) async throws {
        let endpoint = "/auth/reset-password"
        let body = ResetPasswordRequest(email: email, code: code, newPassword: newPassword)
        
        let _: EmptyResponse = try await performRequest(endpoint: endpoint, method: .POST, body: body)
    }
    
    // MARK: - Patient Endpoints
    
    func getPatientDashboard(accessToken: String) async throws -> PatientDashboard {
        let endpoint = "/patients/dashboard"
        
        return try await performAuthenticatedRequest(
            endpoint: endpoint,
            method: .GET,
            body: EmptyRequest(),
            accessToken: accessToken
        )
    }
    
    func updatePatientProfile(profile: PatientProfileUpdate, accessToken: String) async throws -> PatientUser {
        let endpoint = "/patients/profile"
        
        return try await performAuthenticatedRequest(
            endpoint: endpoint,
            method: .PUT,
            body: profile,
            accessToken: accessToken
        )
    }
    
    func signROIConsent(digitalSignature: String, accessToken: String) async throws -> EmptyResponse {
        let endpoint = "/patients/roi-consent"

        let body = ROISignatureRequest(digitalSignature: digitalSignature)
        
        return try await performAuthenticatedRequest(
            endpoint: endpoint,
            method: .POST,
            body: body,
            accessToken: accessToken
        )
    }
    
    func getROIConsentStatus(accessToken: String) async throws -> ROIConsentStatus {
        let endpoint = "/patients/roi-consent"
        
        return try await performAuthenticatedRequest(
            endpoint: endpoint,
            method: .GET,
            body: EmptyRequest(),
            accessToken: accessToken
        )
    }
    
    // MARK: - Transplant Center Endpoints
    
    func getTransplantCenters(accessToken: String) async throws -> [TransplantCenter] {
        let endpoint = "/transplant-centers"
        
        // Call the endpoint directly since it doesn't require authentication
        let url = URL(string: baseURL + endpoint)!
        var request = URLRequest(url: url)
        request.httpMethod = HTTPMethod.GET.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError
        }
        
        switch httpResponse.statusCode {
        case 200...299:
            let decoder = createJSONDecoder()
            let apiResponse = try decoder.decode(APIResponse<[TransplantCenter]>.self, from: data)
            return apiResponse.data ?? []
        case 400...499:
            throw APIError.validationError("Failed to fetch transplant centers")
        case 500...599:
            throw APIError.serverError
        default:
            throw APIError.networkError
        }
    }
    
    func getChatbotTransplantCenters(accessToken: String) async throws -> ChatbotCentersResponse {
        let endpoint = "/transplant-centers/chatbot-data"
        
        return try await performAuthenticatedRequest(
            endpoint: endpoint,
            method: .GET,
            body: EmptyRequest(),
            accessToken: accessToken
        )
    }
    
    func selectTransplantCenters(centerIds: [String], accessToken: String) async throws -> TransplantSelectionResponse {
        let endpoint = "/transplant-centers/select"
        let body = TransplantCenterSelection(transplantCenterIds: centerIds)
        
        // Call the endpoint directly with correct authentication
        let url = URL(string: baseURL + endpoint)!
        var request = URLRequest(url: url)
        request.httpMethod = HTTPMethod.POST.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(body)
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError
        }
        
        switch httpResponse.statusCode {
        case 200...299:
            let decoder = createJSONDecoder()
            return try decoder.decode(TransplantSelectionResponse.self, from: data)
        case 400...499:
            throw APIError.validationError("Failed to select transplant centers")
        case 500...599:
            throw APIError.serverError
        default:
            throw APIError.networkError
        }
    }
    
    func getMyTransplantSelections(accessToken: String) async throws -> [PatientReferral] {
        let endpoint = "/transplant-centers/my-selections"
        
        let response: APIResponse<[PatientReferral]> = try await performAuthenticatedRequest(
            endpoint: endpoint,
            method: .GET,
            body: EmptyRequest(),
            accessToken: accessToken
        )
        
        return response.data ?? []
    }
    
    // MARK: - Private Methods
    
    private func createJSONDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            
            // Try multiple ISO 8601 formatters to handle different date formats
            let formatters = [
                {
                    let formatter = ISO8601DateFormatter()
                    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                    return formatter
                }(),
                ISO8601DateFormatter()
            ]
            
            for formatter in formatters {
                if let date = formatter.date(from: dateString) {
                    return date
                }
            }
            
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date format: \(dateString)")
        }
        return decoder
    }
    
    private func performRequest<T: Codable, U: Codable>(
        endpoint: String,
        method: HTTPMethod,
        body: T? = nil
    ) async throws -> U {
        let url = URL(string: baseURL + endpoint)!
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("TransplantPatientApp/1.0", forHTTPHeaderField: "User-Agent")
        
        if let body = body {
            request.httpBody = try JSONEncoder().encode(body)
        }
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError
        }
        
        // Handle HTTP status codes
        switch httpResponse.statusCode {
        case 200...299:
            // Success - decode response
            if U.self == EmptyResponse.self {
                return EmptyResponse() as! U
            }
            
            do {
                let decoder = createJSONDecoder()
                return try decoder.decode(U.self, from: data)
            } catch {
                // Try to decode as APIResponse wrapper
                let decoder = createJSONDecoder()
                let apiResponse = try decoder.decode(APIResponse<U>.self, from: data)
                if let responseData = apiResponse.data {
                    return responseData
                }
                throw APIError.serverError
            }
            
        case 400:
            // Validation error
            if let errorData = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                throw APIError.validationError(errorData.error)
            }
            throw APIError.validationError("Invalid request")
            
        case 401:
            throw APIError.unauthorized
            
        case 500...599:
            throw APIError.serverError
            
        default:
            throw APIError.networkError
        }
    }
    
    private func performAuthenticatedRequest<T: Codable, U: Codable>(
        endpoint: String,
        method: HTTPMethod,
        body: T? = nil,
        accessToken: String
    ) async throws -> U {
        let url = URL(string: baseURL + endpoint)!
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("TransplantPatientApp/1.0", forHTTPHeaderField: "User-Agent")
        
        if let body = body {
            request.httpBody = try JSONEncoder().encode(body)
        }
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError
        }
        
        // Handle HTTP status codes
        switch httpResponse.statusCode {
        case 200...299:
            // Success - decode response
            if U.self == EmptyResponse.self {
                return EmptyResponse() as! U
            }
            
            do {
                let decoder = createJSONDecoder()
                return try decoder.decode(U.self, from: data)
            } catch {
                // Try to decode as APIResponse wrapper
                let decoder = createJSONDecoder()
                let apiResponse = try decoder.decode(APIResponse<U>.self, from: data)
                if let responseData = apiResponse.data {
                    return responseData
                }
                throw APIError.serverError
            }
            
        case 400:
            // Validation error
            if let errorData = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                throw APIError.validationError(errorData.error)
            }
            throw APIError.validationError("Invalid request")
            
        case 401:
            throw APIError.unauthorized
            
        case 500...599:
            throw APIError.serverError
            
        default:
            throw APIError.networkError
        }
    }
}

// MARK: - Supporting Types

enum HTTPMethod: String {
    case GET = "GET"
    case POST = "POST"
    case PUT = "PUT"
    case DELETE = "DELETE"
    case PATCH = "PATCH"
}

enum APIError: LocalizedError {
    case networkError
    case unauthorized
    case validationError(String)
    case serverError
    
    var errorDescription: String? {
        switch self {
        case .networkError:
            return "Network connection error"
        case .unauthorized:
            return "Authentication required"
        case .validationError(let message):
            return message
        case .serverError:
            return "Server error occurred"
        }
    }
}

// MARK: - Request/Response Models

struct PatientRegistrationRequest: Codable {
    let title: String?
    let firstName: String
    let lastName: String
    let email: String
    let phoneNumber: String?
    let dateOfBirth: String?
    let address: String?
    let primaryCarePhysician: String?
    let insuranceProvider: String?
    let nephrologist: String?
    let dialysisClinic: String
    let socialWorkerName: String
    let referralToken: String?
    let password: String
}

struct EmailVerificationRequest: Codable {
    let email: String
    let code: String
}

struct LoginRequest: Codable {
    let email: String
    let password: String
    let userType: String
}

struct RefreshTokenRequest: Codable {
    let refreshToken: String
}

struct ForgotPasswordRequest: Codable {
    let email: String
}

struct ResetPasswordRequest: Codable {
    let email: String
    let code: String
    let newPassword: String
}

struct TransplantCenterSelection: Codable {
    let transplantCenterIds: [String]
}

struct ROISignatureRequest: Codable {
    let digitalSignature: String
}

struct AuthResponse: Codable {
    let success: Bool
    let data: AuthData
}

struct AuthData: Codable {
    let accessToken: String
    let refreshToken: String
    let idToken: String
    let expiresIn: Int
    let user: PatientUser
}

struct TokenResponse: Codable {
    let accessToken: String
    let refreshToken: String?
}

struct VerificationResponse: Codable {
    let success: Bool
    let message: String
}

struct EmptyResponse: Codable {
    
}

struct EmptyRequest: Codable {
    
}

struct ErrorResponse: Codable {
    let success: Bool
    let error: String
    let code: String?
}

struct APIResponse<T: Codable>: Codable {
    let success: Bool
    let data: T?
    let message: String?
    let errors: [ValidationError]?
}

struct ValidationError: Codable {
    let field: String
    let message: String
    let code: String
}

// MARK: - Social Worker Models
struct SocialWorker: Codable {
    let fullName: String
    let firstName: String
    let lastName: String
    let title: String
}

struct SocialWorkersResponse: Codable {
    let success: Bool
    let data: [String: [SocialWorker]]
}

// Extension for Date formatting
extension Date {
    var iso8601String: String {
        let formatter = ISO8601DateFormatter()
        return formatter.string(from: self)
    }
}
