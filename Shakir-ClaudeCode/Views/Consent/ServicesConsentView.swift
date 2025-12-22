//
//  ServicesConsentView.swift
//  Transplant Platform - Patient Mobile App
//
//  Consent form for Transplant Wizard services
//

import SwiftUI

struct ServicesConsentView: View {
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
                        Image(systemName: "cross.case.fill")
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
                            Text("CONSENT FOR TRANSPLANT WIZARD SERVICES")
                                .font(.system(size: 16, weight: .bold))
                                .multilineTextAlignment(.center)
                            
                            Rectangle()
                                .fill(Color(red: 0.2, green: 0.5, blue: 0.8))
                                .frame(height: 2)
                                .frame(width: 200)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, 20)
                        
                        // Document Content
                        Group {
                            sectionHeader("INTRODUCTION")
                            
                            Text("This document constitutes an agreement between you (the \"Patient\") and Transplant Wizard, LLC (\"Transplant Wizard,\" \"we,\" \"us,\" or \"our\") regarding the use of our transplant coordination and referral services.")
                                .font(.system(size: 13))
                                .padding(.bottom, 16)
                            
                            sectionHeader("DESCRIPTION OF SERVICES")
                            
                            Text("Transplant Wizard provides a digital platform designed to assist patients in navigating the kidney transplant referral process. Our services include:")
                                .font(.system(size: 13))
                                .padding(.bottom, 8)
                            
                            bulletPoint("Facilitating communication between patients, dialysis social workers, and transplant centers")
                            bulletPoint("Secure document collection and transmission")
                            bulletPoint("Transplant center selection assistance")
                            bulletPoint("Care coordination and progress tracking")
                            bulletPoint("Educational resources about the transplant process")
                            
                            sectionHeader("IMPORTANT DISCLAIMERS")
                            
                            Text("By using Transplant Wizard services, you acknowledge and understand that:")
                                .font(.system(size: 13, weight: .semibold))
                                .padding(.bottom, 8)
                            
                            numberedPoint("1.", "Transplant Wizard does NOT provide medical advice, diagnosis, or treatment. We are a coordination service only.")
                            numberedPoint("2.", "All medical decisions regarding your transplant care should be made in consultation with your healthcare providers.")
                            numberedPoint("3.", "Use of our services does not guarantee acceptance by any transplant center or placement on a transplant waiting list.")
                            numberedPoint("4.", "You remain responsible for attending appointments and complying with transplant center requirements.")
                            
                            sectionHeader("DATA SECURITY")
                            
                            Text("We are committed to protecting your personal health information in accordance with the Health Insurance Portability and Accountability Act (HIPAA) and applicable state laws. Your information is encrypted, securely stored, and only shared with authorized parties as specified in the Medical Records Consent Form.")
                                .font(.system(size: 13))
                                .padding(.bottom, 16)
                            
                            sectionHeader("VOLUNTARY PARTICIPATION")
                            
                            Text("Your participation in Transplant Wizard services is entirely voluntary. You may withdraw your consent and discontinue use of our services at any time by contacting us at support@transplantwizard.com. Withdrawal will not affect your eligibility for transplant evaluation through other means.")
                                .font(.system(size: 13))
                                .padding(.bottom, 16)
                            
                            sectionHeader("CONSENT ACKNOWLEDGMENT")
                            
                            Text("By signing below, I acknowledge that:")
                                .font(.system(size: 13, weight: .semibold))
                                .padding(.bottom, 8)
                            
                            consentCheckItem("I have read and understand this consent form")
                            consentCheckItem("I voluntarily agree to use Transplant Wizard services")
                            consentCheckItem("I understand that Transplant Wizard does not provide medical advice")
                            consentCheckItem("I agree to the terms and conditions outlined above")
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
                                
                                Text("I have read, understand, and agree to the terms of this Consent for Transplant Wizard Services.")
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
                                Text("I Agree & Continue")
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
            .navigationTitle("Services Consent")
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
            errorMessage = "Please acknowledge the terms and provide your signature."
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
                    consentType: "services_consent",
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

// MARK: - Consent Signature Pad View

struct ConsentSignaturePadView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var lines: [[CGPoint]] = []
    @State private var currentLine: [CGPoint] = []
    
    let onComplete: (UIImage, String) -> Void
    
    var body: some View {
        NavigationView {
            VStack {
                Text("Sign with your finger below")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding(.top)
                
                Canvas { context, size in
                    for line in lines {
                        var path = Path()
                        if let firstPoint = line.first {
                            path.move(to: firstPoint)
                            for point in line.dropFirst() {
                                path.addLine(to: point)
                            }
                        }
                        context.stroke(path, with: .color(.black), lineWidth: 2)
                    }
                    
                    var currentPath = Path()
                    if let firstPoint = currentLine.first {
                        currentPath.move(to: firstPoint)
                        for point in currentLine.dropFirst() {
                            currentPath.addLine(to: point)
                        }
                    }
                    context.stroke(currentPath, with: .color(.black), lineWidth: 2)
                }
                .background(Color.white)
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color(.systemGray4), lineWidth: 1)
                )
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            currentLine.append(value.location)
                        }
                        .onEnded { _ in
                            lines.append(currentLine)
                            currentLine = []
                        }
                )
                .padding()
                
                HStack {
                    Button("Clear") {
                        lines = []
                        currentLine = []
                    }
                    .foregroundColor(.red)
                    
                    Spacer()
                }
                .padding(.horizontal)
            }
            .navigationTitle("Signature")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        if let image = renderSignature() {
                            if let data = image.pngData() {
                                let base64 = data.base64EncodedString()
                                onComplete(image, base64)
                            }
                        }
                    }
                    .disabled(lines.isEmpty)
                }
            }
        }
    }
    
    private func renderSignature() -> UIImage? {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 400, height: 200))
        return renderer.image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 400, height: 200))
            
            UIColor.black.setStroke()
            
            for line in lines {
                let path = UIBezierPath()
                if let firstPoint = line.first {
                    path.move(to: firstPoint)
                    for point in line.dropFirst() {
                        path.addLine(to: point)
                    }
                }
                path.lineWidth = 2
                path.stroke()
            }
        }
    }
}

#Preview {
    ServicesConsentView(onComplete: {})
        .environmentObject(AuthenticationManager())
}
