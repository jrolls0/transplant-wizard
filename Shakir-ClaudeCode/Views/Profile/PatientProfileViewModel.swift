//
//  PatientProfileViewModel.swift
//  Transplant Platform - Patient Mobile App
//
//  ViewModel for patient profile management
//

import SwiftUI

struct ProfilePhysician: Identifiable, Codable {
    var id = UUID()
    var name: String = ""
    var specialty: String = ""
    var phone: String = ""
    var email: String = ""
    
    enum CodingKeys: String, CodingKey {
        case name, specialty, phone, email
    }
}

@MainActor
class PatientProfileViewModel: ObservableObject {
    // Personal Information
    @Published var fullName: String = ""
    @Published var dateOfBirth: Date? = nil
    @Published var address: String = ""
    
    // Contact Information
    @Published var email: String = ""
    @Published var phone: String = ""
    
    // Emergency Contact
    @Published var emergencyContactName: String = ""
    @Published var emergencyContactRelationship: String = ""
    @Published var emergencyContactPhone: String = ""
    
    // Physical Information
    @Published var height: String = ""
    @Published var weight: String = ""
    
    // Medical Providers
    @Published var nephrologistName: String = ""
    @Published var pcpName: String = ""
    @Published var otherPhysicians: [ProfilePhysician] = []
    
    // Medical History
    @Published var onDialysis: Bool = false
    @Published var dialysisType: String = ""
    @Published var dialysisStartDate: String = ""
    @Published var lastGFR: String = ""
    @Published var diagnosedConditions: String = ""
    @Published var pastSurgeries: String = ""
    
    // Care Team
    @Published var socialWorkerName: String = ""
    @Published var socialWorkerEmail: String = ""
    @Published var socialWorkerPhone: String = ""
    @Published var dialysisClinicName: String = ""
    @Published var dialysisClinicAddress: String = ""
    
    // Signed Documents
    @Published var servicesConsentSignedAt: Date? = nil
    @Published var medicalRecordsConsentSignedAt: Date? = nil
    @Published var intakeFormSubmittedAt: Date? = nil
    
    // UI State
    @Published var isLoading: Bool = false
    @Published var isEditing: Bool = false
    @Published var errorMessage: String? = nil
    @Published var showSuccessMessage: Bool = false
    
    // Backup for cancel functionality
    private var originalData: ProfileData?
    
    var initials: String {
        let components = fullName.split(separator: " ")
        if components.count >= 2 {
            let first = String(components[0].prefix(1))
            let last = String(components[1].prefix(1))
            return (first + last).uppercased()
        } else if let first = components.first {
            return String(first.prefix(2)).uppercased()
        }
        return "?"
    }
    
    func loadProfile() {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        isLoading = true
        
        Task {
            do {
                let profile = try await APIService.shared.getPatientProfile(accessToken: accessToken)
                populateFromProfile(profile)
                saveOriginalData()
                isLoading = false
            } catch {
                print("❌ Error loading profile: \(error)")
                isLoading = false
                errorMessage = "Failed to load profile"
            }
        }
    }
    
    func saveProfile() {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        isLoading = true
        
        Task {
            do {
                let profileData = buildProfileData()
                _ = try await APIService.shared.updatePatientProfile(profileData: profileData, accessToken: accessToken)
                
                isLoading = false
                isEditing = false
                saveOriginalData()
                showSuccessMessage = true
                
                print("✅ Profile saved successfully")
            } catch {
                print("❌ Error saving profile: \(error)")
                isLoading = false
                errorMessage = "Failed to save profile"
            }
        }
    }
    
    func cancelEditing() {
        restoreOriginalData()
        isEditing = false
    }
    
    func addPhysician() {
        otherPhysicians.append(ProfilePhysician())
    }
    
    func removePhysician(at index: Int) {
        guard index < otherPhysicians.count else { return }
        otherPhysicians.remove(at: index)
    }
    
    func deleteAccount() {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        isLoading = true
        
        Task {
            do {
                _ = try await APIService.shared.deletePatientAccount(accessToken: accessToken)
                // Account deleted, auth manager will handle logout
                isLoading = false
            } catch {
                print("❌ Error deleting account: \(error)")
                isLoading = false
                errorMessage = "Failed to delete account"
            }
        }
    }
    
    private func populateFromProfile(_ profile: PatientProfileData) {
        fullName = profile.fullName ?? ""
        
        if let dobString = profile.dateOfBirth {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withFullDate]
            dateOfBirth = formatter.date(from: dobString)
        }
        
        address = profile.address ?? ""
        email = profile.email ?? ""
        phone = profile.phone ?? ""
        
        emergencyContactName = profile.emergencyContactName ?? ""
        emergencyContactRelationship = profile.emergencyContactRelationship ?? ""
        emergencyContactPhone = profile.emergencyContactPhone ?? ""
        
        height = profile.height ?? ""
        weight = profile.weight ?? ""
        
        nephrologistName = profile.nephrologistName ?? ""
        pcpName = profile.pcpName ?? ""
        
        // Filter out any physicians that duplicate nephrologist or PCP
        if let physicians = profile.otherPhysicians {
            let nephName = nephrologistName.lowercased()
            let pcpNameLower = pcpName.lowercased()
            otherPhysicians = physicians.filter { physician in
                let name = physician.name.lowercased()
                return !name.isEmpty && 
                       name != nephName && 
                       name != pcpNameLower &&
                       !name.contains("nephrologist") &&
                       !name.contains("primary care")
            }
        }
        
        onDialysis = profile.onDialysis ?? false
        dialysisType = profile.dialysisType ?? ""
        dialysisStartDate = profile.dialysisStartDate ?? ""
        lastGFR = profile.lastGFR ?? ""
        diagnosedConditions = profile.diagnosedConditions ?? ""
        pastSurgeries = profile.pastSurgeries ?? ""
        
        socialWorkerName = profile.socialWorkerName ?? ""
        socialWorkerEmail = profile.socialWorkerEmail ?? ""
        socialWorkerPhone = profile.socialWorkerPhone ?? ""
        dialysisClinicName = profile.dialysisClinicName ?? ""
        dialysisClinicAddress = profile.dialysisClinicAddress ?? ""
        
        if let servicesDate = profile.servicesConsentSignedAt {
            let formatter = ISO8601DateFormatter()
            servicesConsentSignedAt = formatter.date(from: servicesDate)
        }
        
        if let medicalDate = profile.medicalRecordsConsentSignedAt {
            let formatter = ISO8601DateFormatter()
            medicalRecordsConsentSignedAt = formatter.date(from: medicalDate)
        }
        
        if let intakeDate = profile.intakeFormSubmittedAt {
            let formatter = ISO8601DateFormatter()
            intakeFormSubmittedAt = formatter.date(from: intakeDate)
        }
    }
    
    private func buildProfileData() -> [String: Any] {
        var data: [String: Any] = [
            "full_name": fullName,
            "address": address,
            "email": email,
            "phone": phone,
            "emergency_contact_name": emergencyContactName,
            "emergency_contact_relationship": emergencyContactRelationship,
            "emergency_contact_phone": emergencyContactPhone,
            "height": height,
            "weight": weight,
            "nephrologist_name": nephrologistName,
            "pcp_name": pcpName,
            "last_gfr": lastGFR,
            "diagnosed_conditions": diagnosedConditions,
            "past_surgeries": pastSurgeries
        ]
        
        if let dob = dateOfBirth {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withFullDate]
            data["date_of_birth"] = formatter.string(from: dob)
        }
        
        // Filter out any physicians that match nephrologist or PCP
        let filteredPhysicians = otherPhysicians.filter { physician in
            let name = physician.name.lowercased()
            return !name.isEmpty && 
                   name != nephrologistName.lowercased() && 
                   name != pcpName.lowercased()
        }
        
        let physiciansData = filteredPhysicians.map { physician in
            return [
                "name": physician.name,
                "specialty": physician.specialty,
                "phone": physician.phone,
                "email": physician.email
            ]
        }
        data["other_physicians"] = physiciansData
        
        return data
    }
    
    private func saveOriginalData() {
        originalData = ProfileData(
            fullName: fullName,
            dateOfBirth: dateOfBirth,
            address: address,
            email: email,
            phone: phone,
            emergencyContactName: emergencyContactName,
            emergencyContactRelationship: emergencyContactRelationship,
            emergencyContactPhone: emergencyContactPhone,
            height: height,
            weight: weight,
            nephrologistName: nephrologistName,
            pcpName: pcpName,
            otherPhysicians: otherPhysicians
        )
    }
    
    private func restoreOriginalData() {
        guard let original = originalData else { return }
        
        fullName = original.fullName
        dateOfBirth = original.dateOfBirth
        address = original.address
        email = original.email
        phone = original.phone
        emergencyContactName = original.emergencyContactName
        emergencyContactRelationship = original.emergencyContactRelationship
        emergencyContactPhone = original.emergencyContactPhone
        height = original.height
        weight = original.weight
        nephrologistName = original.nephrologistName
        pcpName = original.pcpName
        otherPhysicians = original.otherPhysicians
    }
}

// MARK: - Data Models

private struct ProfileData {
    let fullName: String
    let dateOfBirth: Date?
    let address: String
    let email: String
    let phone: String
    let emergencyContactName: String
    let emergencyContactRelationship: String
    let emergencyContactPhone: String
    let height: String
    let weight: String
    let nephrologistName: String
    let pcpName: String
    let otherPhysicians: [ProfilePhysician]
}

struct PatientProfileData: Codable {
    let fullName: String?
    let dateOfBirth: String?
    let address: String?
    let email: String?
    let phone: String?
    let emergencyContactName: String?
    let emergencyContactRelationship: String?
    let emergencyContactPhone: String?
    let height: String?
    let weight: String?
    let nephrologistName: String?
    let pcpName: String?
    let otherPhysicians: [ProfilePhysician]?
    let onDialysis: Bool?
    let dialysisType: String?
    let dialysisStartDate: String?
    let lastGFR: String?
    let diagnosedConditions: String?
    let pastSurgeries: String?
    let socialWorkerName: String?
    let socialWorkerEmail: String?
    let socialWorkerPhone: String?
    let dialysisClinicName: String?
    let dialysisClinicAddress: String?
    let servicesConsentSignedAt: String?
    let medicalRecordsConsentSignedAt: String?
    let intakeFormSubmittedAt: String?
    
    enum CodingKeys: String, CodingKey {
        case fullName = "full_name"
        case dateOfBirth = "date_of_birth"
        case address, email, phone
        case emergencyContactName = "emergency_contact_name"
        case emergencyContactRelationship = "emergency_contact_relationship"
        case emergencyContactPhone = "emergency_contact_phone"
        case height, weight
        case nephrologistName = "nephrologist_name"
        case pcpName = "pcp_name"
        case otherPhysicians = "other_physicians"
        case onDialysis = "on_dialysis"
        case dialysisType = "dialysis_type"
        case dialysisStartDate = "dialysis_start_date"
        case lastGFR = "last_gfr"
        case diagnosedConditions = "diagnosed_conditions"
        case pastSurgeries = "past_surgeries"
        case socialWorkerName = "social_worker_name"
        case socialWorkerEmail = "social_worker_email"
        case socialWorkerPhone = "social_worker_phone"
        case dialysisClinicName = "dialysis_clinic_name"
        case dialysisClinicAddress = "dialysis_clinic_address"
        case servicesConsentSignedAt = "services_consent_signed_at"
        case medicalRecordsConsentSignedAt = "medical_records_consent_signed_at"
        case intakeFormSubmittedAt = "intake_form_submitted_at"
    }
}

struct PatientProfileResponse: Codable {
    let success: Bool
    let data: PatientProfileData?
}
