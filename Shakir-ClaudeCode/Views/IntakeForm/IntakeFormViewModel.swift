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
    @Published var heightFeet: Int = 5
    @Published var heightInches: Int = 6
    @Published var weight: String = ""
    @Published var onDialysis: Bool = false
    @Published var dialysisType: String = ""
    @Published var dialysisStartDate: Date? = nil
    @Published var lastGFR: String = ""
    @Published var requiresAdditionalOrgan: Bool = false
    @Published var additionalOrganDetails: String = ""
    
    var height: String {
        "\(heightFeet)'\(heightInches)\""
    }
    
    // Contraindications
    @Published var hasInfection: Bool = false
    @Published var infectionExplanation: String = ""
    @Published var hasCancer: Bool = false
    @Published var cancerExplanation: String = ""
    @Published var hasMentalHealthDisorder: Bool = false
    @Published var mentalHealthExplanation: String = ""
    @Published var usesSubstances: Bool = false
    @Published var substancesExplanation: String = ""
    @Published var recentSurgery: Bool = false
    @Published var surgeryExplanation: String = ""
    @Published var usesOxygen: Bool = false
    @Published var oxygenExplanation: String = ""
    @Published var contraindicationsExplanation: String = "" // Keep for backwards compatibility
    
    // Medical History - now as lists
    @Published var diagnosedConditionsList: [String] = [""]
    @Published var pastSurgeriesList: [String] = [""]
    
    var diagnosedConditions: String {
        diagnosedConditionsList.filter { !$0.isEmpty }.joined(separator: "; ")
    }
    
    var pastSurgeries: String {
        pastSurgeriesList.filter { !$0.isEmpty }.joined(separator: "; ")
    }
    
    // Providers - now with clinic selection
    @Published var dialysisClinics: [DialysisClinicOption] = []
    @Published var selectedDialysisClinicId: String? = nil
    @Published var socialWorkersForClinic: [SocialWorkerOption] = []
    @Published var selectedSocialWorkerId: String? = nil
    
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
    
    func getFirstValidationError() -> String? {
        if fullName.isEmpty {
            return "Full Name is required. Please enter your full name."
        }
        if dateOfBirth == nil {
            return "Date of Birth is required. Please select your date of birth."
        }
        if address.isEmpty {
            return "Address is required. Please enter your address."
        }
        if phone.isEmpty {
            return "Phone number is required. Please enter your phone number."
        }
        if email.isEmpty {
            return "Email is required. Please enter your email address."
        }
        if emergencyContactName.isEmpty {
            return "Emergency Contact Name is required. Please enter an emergency contact."
        }
        if emergencyContactRelationship.isEmpty {
            return "Emergency Contact Relationship is required."
        }
        if emergencyContactPhone.isEmpty {
            return "Emergency Contact Phone is required."
        }
        if weight.isEmpty {
            return "Weight is required. Please enter your weight."
        }
        if signatureData == nil {
            return "Signature is required. Please sign the form to submit."
        }
        return nil
    }
    
    func loadForm() {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        isLoading = true
        
        Task {
            do {
                // Load form data
                let form = try await APIService.shared.getIntakeForm(accessToken: accessToken)
                populateForm(from: form)
                
                // Load dialysis clinics for dropdown
                await loadDialysisClinics(accessToken: accessToken)
                
                isLoading = false
            } catch {
                print("❌ Error loading intake form: \(error)")
                isLoading = false
            }
        }
    }
    
    private func loadDialysisClinics(accessToken: String) async {
        do {
            let clinics = try await APIService.shared.getDialysisClinics(accessToken: accessToken)
            await MainActor.run {
                self.dialysisClinics = clinics
                print("✅ Loaded \(clinics.count) dialysis clinics")
            }
        } catch {
            print("❌ Error loading dialysis clinics: \(error)")
        }
    }
    
    func loadSocialWorkersForClinic(_ clinicId: String) {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        Task {
            do {
                let workers = try await APIService.shared.getSocialWorkersForClinic(clinicId: clinicId, accessToken: accessToken)
                await MainActor.run {
                    self.socialWorkersForClinic = workers
                    self.selectedSocialWorkerId = nil
                    print("✅ Loaded \(workers.count) social workers for clinic \(clinicId)")
                }
            } catch {
                print("❌ Error loading social workers: \(error)")
            }
        }
    }
    
    func selectDialysisClinic(_ clinic: DialysisClinicOption) {
        selectedDialysisClinicId = clinic.id
        dialysisUnitName = clinic.name
        dialysisUnitAddress = clinic.address ?? ""
        dialysisUnitEmail = clinic.email ?? ""
        dialysisUnitPhone = clinic.phone ?? ""
        
        // Load social workers for this clinic
        loadSocialWorkersForClinic(clinic.id)
    }
    
    func selectSocialWorker(_ worker: SocialWorkerOption) {
        selectedSocialWorkerId = worker.id
        socialWorkerName = worker.name
        socialWorkerEmail = worker.email ?? ""
        socialWorkerPhone = worker.phone ?? ""
    }
    
    // List management for conditions and surgeries
    func addCondition() {
        diagnosedConditionsList.append("")
    }
    
    func removeCondition(at index: Int) {
        guard diagnosedConditionsList.count > 1 else { return }
        diagnosedConditionsList.remove(at: index)
    }
    
    func addSurgery() {
        pastSurgeriesList.append("")
    }
    
    func removeSurgery(at index: Int) {
        guard pastSurgeriesList.count > 1 else { return }
        pastSurgeriesList.remove(at: index)
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
        
        // Parse height string like "5'6\"" into feet and inches
        if let heightStr = data.height, !heightStr.isEmpty {
            let parts = heightStr.replacingOccurrences(of: "\"", with: "").split(separator: "'")
            if parts.count >= 1, let feet = Int(parts[0]) {
                heightFeet = feet
            }
            if parts.count >= 2, let inches = Int(parts[1]) {
                heightInches = inches
            }
        }
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
        infectionExplanation = data.infectionExplanation ?? ""
        hasCancer = data.hasCancer ?? false
        cancerExplanation = data.cancerExplanation ?? ""
        hasMentalHealthDisorder = data.hasMentalHealthDisorder ?? false
        mentalHealthExplanation = data.mentalHealthExplanation ?? ""
        usesSubstances = data.usesSubstances ?? false
        substancesExplanation = data.substancesExplanation ?? ""
        recentSurgery = data.recentSurgery ?? false
        surgeryExplanation = data.surgeryExplanation ?? ""
        usesOxygen = data.usesOxygen ?? false
        oxygenExplanation = data.oxygenExplanation ?? ""
        contraindicationsExplanation = data.contraindicationsExplanation ?? ""
        
        // Parse conditions and surgeries from semicolon-separated strings to lists
        if let conditions = data.diagnosedConditions, !conditions.isEmpty {
            diagnosedConditionsList = conditions.split(separator: ";").map { String($0).trimmingCharacters(in: .whitespaces) }
            if diagnosedConditionsList.isEmpty { diagnosedConditionsList = [""] }
        }
        if let surgeries = data.pastSurgeries, !surgeries.isEmpty {
            pastSurgeriesList = surgeries.split(separator: ";").map { String($0).trimmingCharacters(in: .whitespaces) }
            if pastSurgeriesList.isEmpty { pastSurgeriesList = [""] }
        }
        
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
            "infection_explanation": infectionExplanation,
            "has_cancer": hasCancer,
            "cancer_explanation": cancerExplanation,
            "has_mental_health_disorder": hasMentalHealthDisorder,
            "mental_health_explanation": mentalHealthExplanation,
            "uses_substances": usesSubstances,
            "substances_explanation": substancesExplanation,
            "recent_surgery": recentSurgery,
            "surgery_explanation": surgeryExplanation,
            "uses_oxygen": usesOxygen,
            "oxygen_explanation": oxygenExplanation,
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
    let infectionExplanation: String?
    let hasCancer: Bool?
    let cancerExplanation: String?
    let hasMentalHealthDisorder: Bool?
    let mentalHealthExplanation: String?
    let usesSubstances: Bool?
    let substancesExplanation: String?
    let recentSurgery: Bool?
    let surgeryExplanation: String?
    let usesOxygen: Bool?
    let oxygenExplanation: String?
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
        case infectionExplanation = "infection_explanation"
        case hasCancer = "has_cancer"
        case cancerExplanation = "cancer_explanation"
        case hasMentalHealthDisorder = "has_mental_health_disorder"
        case mentalHealthExplanation = "mental_health_explanation"
        case usesSubstances = "uses_substances"
        case substancesExplanation = "substances_explanation"
        case recentSurgery = "recent_surgery"
        case surgeryExplanation = "surgery_explanation"
        case usesOxygen = "uses_oxygen"
        case oxygenExplanation = "oxygen_explanation"
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

// MARK: - Dialysis Clinic and Social Worker Models

struct DialysisClinicOption: Identifiable, Codable {
    let id: String
    let name: String
    let address: String?
    let phone: String?
    let email: String?
    
    enum CodingKeys: String, CodingKey {
        case id, name, address, phone, email
    }
}

struct SocialWorkerOption: Identifiable, Codable {
    let id: String
    let name: String
    let email: String?
    let phone: String?
    
    enum CodingKeys: String, CodingKey {
        case id, name, email, phone
    }
}

struct DialysisClinicsResponse: Codable {
    let success: Bool
    let data: [DialysisClinicOption]?
}

struct ClinicSocialWorkersResponse: Codable {
    let success: Bool
    let data: [SocialWorkerOption]?
}
