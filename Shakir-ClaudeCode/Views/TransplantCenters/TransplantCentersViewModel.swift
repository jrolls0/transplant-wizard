//
//  TransplantCentersViewModel.swift
//  Transplant Platform - Patient Mobile App
//
//  ViewModel for transplant centers management
//

import SwiftUI

enum CenterApplicationStatus: String, Codable {
    case applied = "applied"
    case underReview = "under_review"
    case accepted = "accepted"
    case waitlisted = "waitlisted"
    case declined = "declined"
    
    var displayName: String {
        switch self {
        case .applied: return "Applied"
        case .underReview: return "Under Review"
        case .accepted: return "Accepted"
        case .waitlisted: return "Waitlisted"
        case .declined: return "Declined"
        }
    }
    
    var color: Color {
        switch self {
        case .applied: return .blue
        case .underReview: return .orange
        case .accepted: return .green
        case .waitlisted: return .yellow
        case .declined: return .red
        }
    }
}

struct PatientTransplantCenter: Identifiable, Codable {
    let id: String
    let name: String
    let address: String?
    let city: String?
    let state: String?
    let phone: String?
    let email: String?
    let status: CenterApplicationStatus
    let appliedAt: Date?
    
    enum CodingKeys: String, CodingKey {
        case id, name, address, city, state, phone, email, status
        case appliedAt = "applied_at"
    }
}

@MainActor
class TransplantCentersViewModel: ObservableObject {
    @Published var myCenters: [PatientTransplantCenter] = []
    @Published var availableCenters: [TransplantCenter] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String? = nil
    
    func loadMyCenters() {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        isLoading = true
        
        Task {
            do {
                let centers = try await APIService.shared.getPatientCenters(accessToken: accessToken)
                myCenters = centers
                isLoading = false
            } catch {
                print("❌ Error loading centers: \(error)")
                isLoading = false
                errorMessage = "Failed to load centers"
            }
        }
    }
    
    func loadAvailableCenters() {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        Task {
            do {
                let centers = try await APIService.shared.getTransplantCenters(accessToken: accessToken)
                availableCenters = centers
            } catch {
                print("❌ Error loading available centers: \(error)")
            }
        }
    }
    
    func addCenter(_ center: TransplantCenter) {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        isLoading = true
        
        Task {
            do {
                _ = try await APIService.shared.addPatientCenter(centerId: center.id, accessToken: accessToken)
                
                // Add to local list
                let newCenter = PatientTransplantCenter(
                    id: center.id,
                    name: center.name,
                    address: center.address,
                    city: center.city,
                    state: center.state,
                    phone: center.phone,
                    email: center.email,
                    status: .applied,
                    appliedAt: Date()
                )
                myCenters.append(newCenter)
                
                isLoading = false
                print("✅ Center added: \(center.name)")
            } catch {
                print("❌ Error adding center: \(error)")
                isLoading = false
                errorMessage = "Failed to add center"
            }
        }
    }
    
    func removeCenter(_ center: PatientTransplantCenter) {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        isLoading = true
        
        Task {
            do {
                _ = try await APIService.shared.removePatientCenter(centerId: center.id, accessToken: accessToken)
                
                // Remove from local list
                myCenters.removeAll { $0.id == center.id }
                
                isLoading = false
                print("✅ Center removed: \(center.name)")
            } catch {
                print("❌ Error removing center: \(error)")
                isLoading = false
                errorMessage = "Failed to remove center"
            }
        }
    }
}

// MARK: - API Response Models

struct PatientCentersResponse: Codable {
    let success: Bool
    let data: [PatientTransplantCenter]?
}
