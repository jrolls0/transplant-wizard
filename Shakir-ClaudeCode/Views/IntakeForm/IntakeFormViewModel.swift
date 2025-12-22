//
//  IntakeFormViewModel.swift
//  Transplant Platform - Patient Mobile App
//
//  ViewModel for the medical intake form
//

import SwiftUI

struct Physician: Identifiable, Codable {
    var id = UUID()
    var name: String = ""
    var specialty: String = "Nephrologist"
    var address: String = ""
    var phone: String = ""
    var fax: String = ""
    var email: String = ""
    
    enum CodingKeys: String, CodingKey {
        case name, specialty, address, phone, fax, email
    }
}

@MainActor
class IntakeFormViewModel: ObservableObject {
    // Demographics
    @Published var fullName: String = ""
    @Published var dateOfBirth: Date? = nil
    @Published var address: String = ""
    @Published var phone: String = ""
    @Published var email: String = ""
    
    // Emergency Contact
    @Published var emergencyContactName: String = ""
    @Published var emergencyContactRelationship: String = ""
    @Published var emergencyContactPhone: String = ""
    
    // Social Support
    @Published var socialSupportName: String = ""
    @Published var socialSupportRelationship: String = ""
    @Published var socialSupportPhone: String = ""
    
    // Basic Info
    @Published var height: String = ""
    @Published var weight: String = ""
    @Published var onDialysis: Bool = false
    @Published var dialysisType: String = ""
    @Published var dialysisStartDate: Date? = nil
    @Published var lastGFR: String = ""
    @Published var requiresAdditionalOrgan: Bool = false
    @Published var additionalOrganDetails: String = ""
    
    // Contraindications
    @Published var hasInfection: Bool = false
    @Published var hasCancer: Bool = false
    @Published var hasMentalHealthDisorder: Bool = false
    @Published var usesSubstances: Bool = false
    @Published var recentSurgery: Bool = false
    @Published var usesOxygen: Bool = false
    @Published var contraindicationsExplanation: String = ""
    
    // Medical History
    @Published var diagnosedConditions: String = ""
    @Published var pastSurgeries: String = ""
    
    // Providers
    @Published var dialysisUnitName: String = ""
    @Published var dialysisUnitAddress: String = ""
    @Published var dialysisUnitEmail: String = ""
    @Published var dialysisUnitPhone: String = ""
    
    @Published var socialWorkerName: String = ""
    @Published var socialWorkerEmail: String = ""
    @Published var socialWorkerPhone: String = ""
    
    @Published var otherPhysicians: [Physician] = []
    
    // Signature
    @Published var signatureImage: UIImage? = nil
    @Published var signatureData: String? = nil
    
    // UI State
    @Published var isLoading: Bool = false
    @Published var showSuccessAlert: Bool = false
    @Published var errorMessage: String? = nil
    
    var hasAnyContraindication: Bool {
        hasInfection || hasCancer || hasMentalHealthDisorder || usesSubstances || recentSurgery || usesOxygen
    }
    
    var canSubmit: Bool {
        // Check required fields
        !fullName.isEmpty &&
        dateOfBirth != nil &&
        !address.isEmpty &&
        !phone.isEmpty &&
        !email.isEmpty &&
        !emergencyContactName.isEmpty &&
        !emergencyContactRelationship.isEmpty &&
        !emergencyContactPhone.isEmpty &&
        !height.isEmpty &&
        !weight.isEmpty &&
        signatureData != nil
    }
    
    func loadForm() {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        isLoading = true
        
        Task {
            do {
                let form = try await APIService.shared.getIntakeForm(accessToken: accessToken)
                populateForm(from: form)
                isLoading = false
            } catch {
                print("❌ Error loading intake form: \(error)")
                isLoading = false
            }
        }
    }
    
    func saveForm() {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        isLoading = true
        
        Task {
            do {
                let formData = buildFormData()
                _ = try await APIService.shared.saveIntakeForm(formData: formData, accessToken: accessToken)
                isLoading = false
                print("✅ Form saved successfully")
            } catch {
                print("❌ Error saving form: \(error)")
                isLoading = false
            }
        }
    }
    
    func submitForm() {
        guard let accessToken = KeychainManager.shared.getAccessToken(),
              let signature = signatureData else { return }
        
        isLoading = true
        
        Task {
            do {
                // First save the form
                let formData = buildFormData()
                _ = try await APIService.shared.saveIntakeForm(formData: formData, accessToken: accessToken)
                
                // Then submit with signature
                _ = try await APIService.shared.submitIntakeForm(signatureData: signature, accessToken: accessToken)
                
                isLoading = false
                showSuccessAlert = true
                print("✅ Form submitted successfully")
                
                // Notify that todos may have changed
                NotificationCenter.default.post(name: .todosUpdated, object: nil)
            } catch {
                print("❌ Error submitting form: \(error)")
                isLoading = false
                errorMessage = "Failed to submit form. Please try again."
            }
        }
    }
    
    func validateForm() -> Bool {
        if !canSubmit {
            errorMessage = "Please fill in all required fields and sign the form."
            return false
        }
        return true
    }
    
    func addPhysician() {
        otherPhysicians.append(Physician())
    }
    
    func removePhysician(at index: Int) {
        if index < otherPhysicians.count {
            otherPhysicians.remove(at: index)
        }
    }
    
    private func populateForm(from data: IntakeFormData) {
        fullName = data.fullName ?? ""
        
        if let dobString = data.dateOfBirth {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withFullDate]
            dateOfBirth = formatter.date(from: dobString)
        }
        
        address = data.address ?? ""
        phone = data.phone ?? ""
        email = data.email ?? ""
        
        emergencyContactName = data.emergencyContactName ?? ""
        emergencyContactRelationship = data.emergencyContactRelationship ?? ""
        emergencyContactPhone = data.emergencyContactPhone ?? ""
        
        socialSupportName = data.socialSupportName ?? ""
        socialSupportRelationship = data.socialSupportRelationship ?? ""
        socialSupportPhone = data.socialSupportPhone ?? ""
        
        height = data.height ?? ""
        weight = data.weight ?? ""
        onDialysis = data.onDialysis ?? false
        dialysisType = data.dialysisType ?? ""
        
        if let dialysisDateString = data.dialysisStartDate {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withFullDate]
            dialysisStartDate = formatter.date(from: dialysisDateString)
        }
        
        lastGFR = data.lastGfr ?? ""
        requiresAdditionalOrgan = data.requiresAdditionalOrgan ?? false
        additionalOrganDetails = data.additionalOrganDetails ?? ""
        
        hasInfection = data.hasInfection ?? false
        hasCancer = data.hasCancer ?? false
        hasMentalHealthDisorder = data.hasMentalHealthDisorder ?? false
        usesSubstances = data.usesSubstances ?? false
        recentSurgery = data.recentSurgery ?? false
        usesOxygen = data.usesOxygen ?? false
        contraindicationsExplanation = data.contraindicationsExplanation ?? ""
        
        diagnosedConditions = data.diagnosedConditions ?? ""
        pastSurgeries = data.pastSurgeries ?? ""
        
        dialysisUnitName = data.dialysisUnitName ?? ""
        dialysisUnitAddress = data.dialysisUnitAddress ?? ""
        dialysisUnitEmail = data.dialysisUnitEmail ?? ""
        dialysisUnitPhone = data.dialysisUnitPhone ?? ""
        
        socialWorkerName = data.socialWorkerName ?? ""
        socialWorkerEmail = data.socialWorkerEmail ?? ""
        socialWorkerPhone = data.socialWorkerPhone ?? ""
        
        if let physicians = data.otherPhysicians {
            otherPhysicians = physicians
        }
        
        // If there's existing signature data, we can't render it back to image easily
        // but we can indicate it exists
        if data.signatureData != nil {
            signatureData = data.signatureData
        }
    }
    
    private func buildFormData() -> [String: Any] {
        var data: [String: Any] = [
            "full_name": fullName,
            "address": address,
            "phone": phone,
            "email": email,
            "emergency_contact_name": emergencyContactName,
            "emergency_contact_relationship": emergencyContactRelationship,
            "emergency_contact_phone": emergencyContactPhone,
            "social_support_name": socialSupportName,
            "social_support_relationship": socialSupportRelationship,
            "social_support_phone": socialSupportPhone,
            "height": height,
            "weight": weight,
            "on_dialysis": onDialysis,
            "dialysis_type": dialysisType,
            "last_gfr": lastGFR,
            "requires_additional_organ": requiresAdditionalOrgan,
            "additional_organ_details": additionalOrganDetails,
            "has_infection": hasInfection,
            "has_cancer": hasCancer,
            "has_mental_health_disorder": hasMentalHealthDisorder,
            "uses_substances": usesSubstances,
            "recent_surgery": recentSurgery,
            "uses_oxygen": usesOxygen,
            "contraindications_explanation": contraindicationsExplanation,
            "diagnosed_conditions": diagnosedConditions,
            "past_surgeries": pastSurgeries,
            "dialysis_unit_name": dialysisUnitName,
            "dialysis_unit_address": dialysisUnitAddress,
            "dialysis_unit_email": dialysisUnitEmail,
            "dialysis_unit_phone": dialysisUnitPhone,
            "social_worker_name": socialWorkerName,
            "social_worker_email": socialWorkerEmail,
            "social_worker_phone": socialWorkerPhone,
            "status": "draft"
        ]
        
        if let dob = dateOfBirth {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withFullDate]
            data["date_of_birth"] = formatter.string(from: dob)
        }
        
        if let dialysisDate = dialysisStartDate {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withFullDate]
            data["dialysis_start_date"] = formatter.string(from: dialysisDate)
        }
        
        // Convert physicians to the format expected by the API
        let physiciansData = otherPhysicians.map { physician in
            return [
                "name": physician.name,
                "specialty": physician.specialty,
                "address": physician.address,
                "phone": physician.phone,
                "fax": physician.fax,
                "email": physician.email
            ]
        }
        data["other_physicians"] = physiciansData
        
        return data
    }
}

// MARK: - API Response Models

struct IntakeFormData: Codable {
    let patientId: String?
    let fullName: String?
    let dateOfBirth: String?
    let address: String?
    let phone: String?
    let email: String?
    let emergencyContactName: String?
    let emergencyContactRelationship: String?
    let emergencyContactPhone: String?
    let socialSupportName: String?
    let socialSupportRelationship: String?
    let socialSupportPhone: String?
    let height: String?
    let weight: String?
    let onDialysis: Bool?
    let dialysisType: String?
    let dialysisStartDate: String?
    let lastGfr: String?
    let requiresAdditionalOrgan: Bool?
    let additionalOrganDetails: String?
    let hasInfection: Bool?
    let hasCancer: Bool?
    let hasMentalHealthDisorder: Bool?
    let usesSubstances: Bool?
    let recentSurgery: Bool?
    let usesOxygen: Bool?
    let contraindicationsExplanation: String?
    let diagnosedConditions: String?
    let pastSurgeries: String?
    let dialysisUnitName: String?
    let dialysisUnitAddress: String?
    let dialysisUnitEmail: String?
    let dialysisUnitPhone: String?
    let socialWorkerName: String?
    let socialWorkerEmail: String?
    let socialWorkerPhone: String?
    let otherPhysicians: [Physician]?
    let signatureData: String?
    let status: String?
    
    enum CodingKeys: String, CodingKey {
        case patientId = "patient_id"
        case fullName = "full_name"
        case dateOfBirth = "date_of_birth"
        case address, phone, email
        case emergencyContactName = "emergency_contact_name"
        case emergencyContactRelationship = "emergency_contact_relationship"
        case emergencyContactPhone = "emergency_contact_phone"
        case socialSupportName = "social_support_name"
        case socialSupportRelationship = "social_support_relationship"
        case socialSupportPhone = "social_support_phone"
        case height, weight
        case onDialysis = "on_dialysis"
        case dialysisType = "dialysis_type"
        case dialysisStartDate = "dialysis_start_date"
        case lastGfr = "last_gfr"
        case requiresAdditionalOrgan = "requires_additional_organ"
        case additionalOrganDetails = "additional_organ_details"
        case hasInfection = "has_infection"
        case hasCancer = "has_cancer"
        case hasMentalHealthDisorder = "has_mental_health_disorder"
        case usesSubstances = "uses_substances"
        case recentSurgery = "recent_surgery"
        case usesOxygen = "uses_oxygen"
        case contraindicationsExplanation = "contraindications_explanation"
        case diagnosedConditions = "diagnosed_conditions"
        case pastSurgeries = "past_surgeries"
        case dialysisUnitName = "dialysis_unit_name"
        case dialysisUnitAddress = "dialysis_unit_address"
        case dialysisUnitEmail = "dialysis_unit_email"
        case dialysisUnitPhone = "dialysis_unit_phone"
        case socialWorkerName = "social_worker_name"
        case socialWorkerEmail = "social_worker_email"
        case socialWorkerPhone = "social_worker_phone"
        case otherPhysicians = "other_physicians"
        case signatureData = "signature_data"
        case status
    }
}

struct IntakeFormResponse: Codable {
    let success: Bool
    let data: IntakeFormData?
    let isNew: Bool?
}
