//
//  PatientModels.swift
//  Transplant Platform - Patient Mobile App
//
//  Data models for patient-related API responses
//

import Foundation

// MARK: - Missing Model Types

struct PatientDashboard: Codable {
    let profileCompleted: Bool
    let onboardingCompleted: Bool
    let roiSigned: Bool
    let referralsSubmitted: Int
    let selectedTransplantCenters: [TransplantCenter]
}

struct PatientProfileUpdate: Codable {
    let title: String?
    let firstName: String?
    let lastName: String?
    let phoneNumber: String?
    let dateOfBirth: String?
    let address: String?
    let primaryCarePhysician: String?
    let insuranceProvider: String?
}

struct ROIConsentData: Codable {
    let consentText: String
    let digitalSignature: String
}

struct ROIConsentResponse: Codable {
    let success: Bool
    let consentId: String
    let signedAt: Date
    let expiresAt: Date?
}

struct ROIConsentStatus: Codable {
    let signed: Bool
    let signedAt: Date?
    let expiresAt: Date?
    let consentText: String?
    let requiresRenewal: Bool
}

struct ChatbotCentersResponse: Codable {
    let centers: [ChatbotCenter]
    let totalCount: Int
    let conversationContext: String
}

struct ChatbotCenter: Codable, Identifiable {
    let id: String
    let name: String
    let location: String
    let waitTime: String
    let specialties: [String]
    let distance: String?
    let highlights: [String]
    let chatbotDescription: String
}

struct TransplantSelectionResponse: Codable {
    let success: Bool
    let message: String
    let selectedCenters: Int
}

// MARK: - Dashboard Models

struct ActivityItem: Codable, Identifiable {
    let id: String
    let type: String
    let title: String
    let description: String
    let timestamp: Date
    let completed: Bool
}

struct NextStep: Codable, Identifiable {
    let id: String
    let title: String
    let description: String
    let priority: StepPriority
    let estimatedTime: String
    let completed: Bool
}

enum StepPriority: String, Codable {
    case high = "high"
    case medium = "medium"
    case low = "low"
    
    var displayName: String {
        switch self {
        case .high: return "High"
        case .medium: return "Medium"
        case .low: return "Low"
        }
    }
    
    var color: String {
        switch self {
        case .high: return "red"
        case .medium: return "orange"
        case .low: return "green"
        }
    }
}

// MARK: - Profile Models
// (PatientProfileUpdate already defined above)

// MARK: - ROI Consent Models
// (ROI consent models already defined above)

// MARK: - Transplant Center Models

struct TransplantCenter: Codable, Identifiable {
    let id: String
    let name: String
    let address: String
    let city: String?
    let state: String?
    let zipCode: String?
    let distanceMiles: String?
    let phone: String?
    let email: String?
    let website: String?
    let specialties: [String]
    let averageWaitTimeMonths: Int?
    let isActive: Bool
    let description: String?
    let facilities: [String]?
    let certifications: [String]?
    
    enum CodingKeys: String, CodingKey {
        case id, name, address, city, state, phone, email, website, specialties, description, facilities, certifications
        case zipCode = "zip_code"
        case distanceMiles = "distance_miles"
        case averageWaitTimeMonths = "average_wait_time_months"
        case isActive = "is_active"
    }
    
    var fullAddress: String {
        var components = [address]
        if let city = city { components.append(city) }
        if let state = state { components.append(state) }
        if let zipCode = zipCode { components.append(zipCode) }
        return components.joined(separator: ", ")
    }
    
    var waitTimeDescription: String {
        guard let waitTime = averageWaitTimeMonths else {
            return "Wait time not available"
        }
        
        if waitTime < 12 {
            return "\(waitTime) month\(waitTime == 1 ? "" : "s")"
        } else {
            let years = waitTime / 12
            let months = waitTime % 12
            var result = "\(years) year\(years == 1 ? "" : "s")"
            if months > 0 {
                result += ", \(months) month\(months == 1 ? "" : "s")"
            }
            return result
        }
    }
}

// (Duplicate models removed - already defined above)

struct PatientReferral: Codable, Identifiable {
    let id: String
    let patientId: String
    let transplantCenterId: String
    let transplantCenter: TransplantCenter?
    let status: ReferralStatus
    let selectionOrder: Int
    let submittedAt: Date
    let acknowledgedAt: Date?
    let completedAt: Date?
}

enum ReferralStatus: String, Codable {
    case pending = "pending"
    case submitted = "submitted"
    case acknowledged = "acknowledged"
    case completed = "completed"
    
    var displayName: String {
        switch self {
        case .pending: return "Pending"
        case .submitted: return "Submitted"
        case .acknowledged: return "Acknowledged"
        case .completed: return "Completed"
        }
    }
    
    var color: String {
        switch self {
        case .pending: return "orange"
        case .submitted: return "blue"
        case .acknowledged: return "green"
        case .completed: return "green"
        }
    }
}