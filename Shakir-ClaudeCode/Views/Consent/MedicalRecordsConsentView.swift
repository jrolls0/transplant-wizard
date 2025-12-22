//
//  MedicalRecordsConsentView.swift
//  Transplant Platform - Patient Mobile App
//
//  HIPAA-compliant consent form for sharing medical records
//

import SwiftUI

struct MedicalRecordsConsentView: View {
    @EnvironmentObject private var authManager: AuthenticationManager
    @State private var isLoading = false
    @State private var errorMessage = ""
    @State private var showSignaturePad = false
    @State private var signatureImage: UIImage? = nil
    @State private var signatureData: String? = nil
    @State private var acknowledgeConsent = false
    
    let onComplete: () -> Void
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 0) {
                    // Header with Logo
                    VStack(spacing: 16) {
                        Image(systemName: "doc.text.fill")
                            .font(.system(size: 50))
                            .foregroundColor(Color(red: 0.2, green: 0.5, blue: 0.8))
                        
                        Text("TRANSPLANT WIZARD")
                            .font(.system(size: 14, weight: .bold))
                            .tracking(2)
                            .foregroundColor(Color(red: 0.2, green: 0.5, blue: 0.8))
                    }
                    .padding(.top, 24)
                    .padding(.bottom, 20)
                    
                    // Document Container
                    VStack(alignment: .leading, spacing: 0) {
                        // Title Section
                        VStack(spacing: 8) {
                            Text("AUTHORIZATION FOR RELEASE")
                                .font(.system(size: 16, weight: .bold))
                            Text("OF PROTECTED HEALTH INFORMATION")
                                .font(.system(size: 16, weight: .bold))
                            
                            Rectangle()
                                .fill(Color(red: 0.2, green: 0.5, blue: 0.8))
                                .frame(height: 2)
                                .frame(width: 280)
                            
                            Text("HIPAA COMPLIANT • 45 CFR § 164.508")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.secondary)
                                .padding(.top, 4)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, 20)
                        
                        // Document Content
                        Group {
                            sectionHeader("PURPOSE OF AUTHORIZATION")
                            
                            Text("I hereby authorize the use and/or disclosure of my individually identifiable health information as described below. This authorization is made in compliance with the Health Insurance Portability and Accountability Act of 1996 (HIPAA) Privacy Rule.")
                                .font(.system(size: 13))
                                .padding(.bottom, 16)
                            
                            sectionHeader("INFORMATION TO BE DISCLOSED")
                            
                            Text("I authorize the release of the following protected health information (PHI):")
                                .font(.system(size: 13))
                                .padding(.bottom, 8)
                            
                            bulletPoint("Medical records related to kidney disease, dialysis treatment, and transplant evaluation")
                            bulletPoint("Laboratory results including blood tests, urinalysis, and tissue typing")
                            bulletPoint("Diagnostic imaging reports and results")
                            bulletPoint("Medication lists and pharmacy records")
                            bulletPoint("Clinical notes and physician summaries")
                            bulletPoint("Social work assessments and psychosocial evaluations")
                            bulletPoint("Insurance and financial clearance documentation")
                            bulletPoint("Immunization records")
                            
                            sectionHeader("AUTHORIZED PARTIES")
                            
                            Text("I authorize disclosure of my PHI to and from the following parties:")
                                .font(.system(size: 13, weight: .semibold))
                                .padding(.bottom, 8)
                            
                            numberedPoint("1.", "Transplant Centers: Selected transplant programs for evaluation and listing purposes")
                            numberedPoint("2.", "Dialysis Unit Social Workers (DUSW): For care coordination and document management")
                            numberedPoint("3.", "Healthcare Providers: Physicians, specialists, and care teams involved in my transplant evaluation")
                            numberedPoint("4.", "Transplant Wizard: For secure transmission and coordination of medical information")
                            
                            sectionHeader("DURATION OF AUTHORIZATION")
                            
                            Text("This authorization shall remain in effect for a period of twenty-four (24) months from the date of signature, unless revoked earlier in writing by the patient or patient's legal representative.")
                                .font(.system(size: 13))
                                .padding(.bottom, 16)
                            
                            sectionHeader("RIGHT TO REVOKE")
                            
                            Text("I understand that I have the right to revoke this authorization at any time by submitting a written request to Transplant Wizard at support@transplantwizard.com. I understand that revocation will not affect any actions taken in reliance on this authorization prior to receipt of my written revocation.")
                                .font(.system(size: 13))
                                .padding(.bottom, 16)
                            
                            sectionHeader("REDISCLOSURE NOTICE")
                            
                            Text("I understand that once my health information is disclosed pursuant to this authorization, it may no longer be protected by federal privacy regulations and could potentially be redisclosed by the recipient.")
                                .font(.system(size: 13))
                                .padding(.bottom, 16)
                            
                            sectionHeader("VOLUNTARY AUTHORIZATION")
                            
                            Text("I understand that:")
                                .font(.system(size: 13, weight: .semibold))
                                .padding(.bottom, 8)
                            
                            consentCheckItem("This authorization is voluntary")
                            consentCheckItem("I may refuse to sign this authorization")
                            consentCheckItem("My treatment will not be conditioned on signing this authorization")
                            consentCheckItem("I am entitled to receive a copy of this signed authorization")
                            
                            sectionHeader("ACKNOWLEDGMENT")
                            
                            Text("By signing below, I certify that I have read and understand this Authorization for Release of Protected Health Information, and I voluntarily consent to the disclosure of my health information as described herein.")
                                .font(.system(size: 13))
                                .padding(.bottom, 8)
                        }
                        
                        // Signature Section
                        VStack(alignment: .leading, spacing: 16) {
                            Rectangle()
                                .fill(Color(.systemGray4))
                                .frame(height: 1)
                                .padding(.vertical, 20)
                            
                            Text("PATIENT SIGNATURE")
                                .font(.system(size: 14, weight: .bold))
                            
                            // Acknowledgment Checkbox
                            HStack(alignment: .top, spacing: 12) {
                                Button(action: { acknowledgeConsent.toggle() }) {
                                    Image(systemName: acknowledgeConsent ? "checkmark.square.fill" : "square")
                                        .font(.title2)
                                        .foregroundColor(acknowledgeConsent ? Color(red: 0.2, green: 0.5, blue: 0.8) : .secondary)
                                }
                                
                                Text("I authorize the release of my protected health information as described above and understand my rights regarding this authorization.")
                                    .font(.system(size: 13))
                            }
                            .padding(.bottom, 8)
                            
                            // Signature Display/Button
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Signature (tap to sign)")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(.secondary)
                                
                                Button(action: { showSignaturePad = true }) {
                                    ZStack {
                                        RoundedRectangle(cornerRadius: 8)
                                            .fill(Color(.systemGray6))
                                            .frame(height: 100)
                                        
                                        if let image = signatureImage {
                                            Image(uiImage: image)
                                                .resizable()
                                                .scaledToFit()
                                                .frame(height: 90)
                                        } else {
                                            VStack(spacing: 8) {
                                                Image(systemName: "signature")
                                                    .font(.system(size: 30))
                                                    .foregroundColor(.secondary)
                                                Text("Tap to sign with your finger")
                                                    .font(.caption)
                                                    .foregroundColor(.secondary)
                                            }
                                        }
                                    }
                                }
                                
                                if signatureImage != nil {
                                    Button("Clear Signature") {
                                        signatureImage = nil
                                        signatureData = nil
                                    }
                                    .font(.caption)
                                    .foregroundColor(.red)
                                }
                            }
                            
                            // Date
                            HStack {
                                Text("Date:")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(.secondary)
                                Text(Date().formatted(date: .long, time: .omitted))
                                    .font(.system(size: 13))
                            }
                            .padding(.top, 8)
                            
                            // Legal Footer
                            Text("This form complies with HIPAA regulations (45 CFR Parts 160 and 164) and applicable state privacy laws.")
                                .font(.system(size: 10))
                                .foregroundColor(.secondary)
                                .italic()
                                .padding(.top, 12)
                        }
                    }
                    .padding(20)
                    .background(Color.white)
                    .cornerRadius(12)
                    .shadow(color: Color.black.opacity(0.1), radius: 4, x: 0, y: 2)
                    .padding(.horizontal, 16)
                    
                    // Error Message
                    if !errorMessage.isEmpty {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundColor(.red)
                            .padding(.top, 12)
                    }
                    
                    // Submit Button
                    Button(action: submitConsent) {
                        HStack {
                            if isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    .scaleEffect(0.8)
                            } else {
                                Text("I Authorize & Continue")
                                    .fontWeight(.semibold)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(
                            LinearGradient(
                                colors: isFormValid ?
                                    [Color(red: 0.2, green: 0.5, blue: 0.8), Color(red: 0.1, green: 0.4, blue: 0.7)] :
                                    [Color.gray, Color.gray],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(!isFormValid || isLoading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 24)
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Medical Records Authorization")
            .navigationBarTitleDisplayMode(.inline)
        }
        .sheet(isPresented: $showSignaturePad) {
            ConsentSignaturePadView { image, data in
                signatureImage = image
                signatureData = data
                showSignaturePad = false
            }
        }
    }
    
    private var isFormValid: Bool {
        acknowledgeConsent && signatureData != nil
    }
    
    private func submitConsent() {
        guard isFormValid, let signature = signatureData else {
            errorMessage = "Please acknowledge the authorization and provide your signature."
            return
        }
        
        isLoading = true
        errorMessage = ""
        
        Task {
            do {
                guard let accessToken = KeychainManager.shared.getAccessToken() else {
                    throw NSError(domain: "", code: -1, userInfo: [NSLocalizedDescriptionKey: "Authentication required"])
                }
                
                try await APIService.shared.submitConsent(
                    consentType: "medical_records_consent",
                    signatureData: signature,
                    accessToken: accessToken
                )
                
                await MainActor.run {
                    isLoading = false
                    HapticManager.shared.success()
                    onComplete()
                }
            } catch {
                await MainActor.run {
                    isLoading = false
                    HapticManager.shared.error()
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
    
    // MARK: - Helper Views
    
    private func sectionHeader(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .bold))
            .foregroundColor(Color(red: 0.2, green: 0.5, blue: 0.8))
            .padding(.bottom, 8)
            .padding(.top, 4)
    }
    
    private func bulletPoint(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("•")
                .font(.system(size: 13))
            Text(text)
                .font(.system(size: 13))
        }
        .padding(.bottom, 4)
        .padding(.leading, 8)
    }
    
    private func numberedPoint(_ number: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(number)
                .font(.system(size: 13, weight: .semibold))
                .frame(width: 20, alignment: .leading)
            Text(text)
                .font(.system(size: 13))
        }
        .padding(.bottom, 6)
        .padding(.leading, 8)
    }
    
    private func consentCheckItem(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 12))
                .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.4))
            Text(text)
                .font(.system(size: 13))
        }
        .padding(.bottom, 4)
        .padding(.leading, 8)
    }
}

#Preview {
    MedicalRecordsConsentView(onComplete: {})
        .environmentObject(AuthenticationManager())
}
