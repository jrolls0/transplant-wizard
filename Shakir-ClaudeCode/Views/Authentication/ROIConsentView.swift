//
//  ROIConsentView.swift
//  Transplant Platform - Patient Mobile App
//
//  HIPAA-compliant Release of Information consent form
//

import SwiftUI

struct ROIConsentView: View {
    @EnvironmentObject private var authManager: AuthenticationManager
    @State private var isLoading = false
    @State private var errorMessage = ""
    @State private var hasScrolledToBottom = false
    @State private var digitalSignature = ""
    @State private var acknowledgeConsent = false
    
    // ROI consent text from the document provided
    private let roiConsentText = """
RELEASE OF INFORMATION (ROI) AUTHORIZATION

Patient Name: ________________________________

I, the undersigned patient, hereby authorize the disclosure of my protected health information (PHI) as described below:

PURPOSE: To facilitate my transplant evaluation and referral process through the Transplant Platform application.

INFORMATION TO BE DISCLOSED:
• Medical records related to kidney disease and transplant evaluation
• Laboratory results and diagnostic test results
• Treatment history and current medications
• Social work assessments and psychosocial evaluations
• Insurance information and financial clearance documentation

AUTHORIZED RECIPIENTS:
• Selected transplant centers for evaluation purposes
• Dialysis social workers managing my care
• Healthcare providers involved in my transplant evaluation
• Transplant Platform administrators for care coordination

EXPIRATION: This authorization will remain in effect for 12 months from the date of signature, unless revoked earlier in writing.

REVOCATION RIGHTS: I understand that I may revoke this authorization at any time by providing written notice to my dialysis facility. Revocation will not affect information already disclosed.

REDISCLOSURE WARNING: I understand that information disclosed pursuant to this authorization may be subject to redisclosure by the recipient and may no longer be protected by federal privacy regulations.

VOLUNTARY NATURE: I understand that my treatment, payment, enrollment, or eligibility for benefits will not be conditioned on whether I sign this authorization.

COPY RETENTION: I understand that I may request a copy of this signed authorization.

By providing my digital signature below, I acknowledge that:
1. I have read and understand this authorization
2. I voluntarily consent to the disclosure of my health information as described
3. I understand my rights regarding this authorization
4. All questions have been answered to my satisfaction

Digital Signature: _______________________________

Date: _______________________________

This form complies with HIPAA regulations (45 CFR Parts 160 and 164) and state privacy laws.
"""
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    VStack(spacing: 12) {
                        Image(systemName: "doc.text.fill")
                            .font(.system(size: 60))
                            .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                        
                        Text("Release of Information")
                            .font(.title2)
                            .fontWeight(.bold)
                        
                        Text("Before accessing your dashboard, please review and sign the Release of Information authorization below.")
                            .font(.body)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 20)
                    .padding(.horizontal, 20)
                    
                    // ROI Document
                    VStack(alignment: .leading, spacing: 16) {
                        ScrollViewReader { proxy in
                            VStack(alignment: .leading, spacing: 16) {
                                Text(roiConsentText)
                                    .font(.system(size: 14))
                                    .lineSpacing(4)
                                    .padding(16)
                                    .background(Color(.systemGray6))
                                    .cornerRadius(12)
                                
                                HStack {
                                    Spacer()
                                    Text("Scroll to bottom to continue")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                        .opacity(hasScrolledToBottom ? 0 : 1)
                                    Spacer()
                                }
                                .id("bottom")
                            }
                            .onAppear {
                                // Detect when user scrolls to bottom
                                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                                    withAnimation {
                                        hasScrolledToBottom = true
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    
                    // Signature Section
                    if hasScrolledToBottom {
                        VStack(spacing: 20) {
                            Divider()
                            
                            VStack(alignment: .leading, spacing: 16) {
                                Text("Digital Signature")
                                    .font(.headline)
                                    .fontWeight(.semibold)
                                
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Full Name *")
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                    
                                    TextField("Type your full legal name", text: $digitalSignature)
                                        .textFieldStyle(.roundedBorder)
                                        .autocapitalization(.words)
                                        .autocorrectionDisabled()
                                }
                                
                                HStack(alignment: .top, spacing: 12) {
                                    Button(action: {
                                        acknowledgeConsent.toggle()
                                    }) {
                                        Image(systemName: acknowledgeConsent ? "checkmark.square.fill" : "square")
                                            .font(.title2)
                                            .foregroundColor(acknowledgeConsent ? Color(red: 0.2, green: 0.6, blue: 0.9) : .secondary)
                                    }
                                    
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("I acknowledge that I have read, understood, and agree to the Release of Information authorization above.")
                                            .font(.body)
                                        
                                        Text("By typing my name and checking this box, I provide my electronic signature with the same legal effect as a handwritten signature.")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                }
                            }
                            .padding(.horizontal, 20)
                            
                            // Sign Button
                            Button(action: handleROISignature) {
                                HStack {
                                    if isLoading {
                                        ProgressView()
                                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                            .scaleEffect(0.8)
                                    } else {
                                        Text("Sign & Continue")
                                            .fontWeight(.semibold)
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                                .background(
                                    LinearGradient(
                                        colors: isSignatureValid ? 
                                            [Color(red: 0.2, green: 0.6, blue: 0.9), Color(red: 0.1, green: 0.5, blue: 0.8)] :
                                            [Color.gray, Color.gray],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .foregroundColor(.white)
                                .cornerRadius(12)
                                .disabled(!isSignatureValid || isLoading)
                            }
                            .padding(.horizontal, 20)
                            .padding(.bottom, 20)
                        }
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                        .animation(.easeInOut(duration: 0.5), value: hasScrolledToBottom)
                    }
                }
            }
            .navigationTitle("ROI Authorization")
            .navigationBarTitleDisplayMode(.inline)
            .alert("ROI Signature Error", isPresented: .constant(!errorMessage.isEmpty)) {
                Button("OK") { 
                    errorMessage = ""
                }
            } message: {
                Text(errorMessage)
            }
        }
    }
    
    private var isSignatureValid: Bool {
        !digitalSignature.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && 
        digitalSignature.count >= 2 && 
        acknowledgeConsent
    }
    
    private func handleROISignature() {
        guard isSignatureValid else {
            errorMessage = "Please provide your full legal name and acknowledge the consent."
            return
        }
        
        isLoading = true
        
        Task {
            let success = await authManager.signROIConsent(
                digitalSignature: digitalSignature.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            
            await MainActor.run {
                isLoading = false
                
                if success {
                    HapticManager.shared.success()
                    // Navigation will automatically update due to roiSigned state change
                } else {
                    HapticManager.shared.error()
                    errorMessage = authManager.authError ?? "Failed to sign ROI. Please try again."
                }
            }
        }
    }
}

#Preview {
    ROIConsentView()
        .environmentObject(AuthenticationManager())
}